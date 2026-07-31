// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { TestBase } from "./TestBase.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { MockStockToken } from "../../contracts/mocks/MockStockToken.sol";
import { MockStockSwapAdapter } from "../../contracts/mocks/MockStockSwapAdapter.sol";
import { RoundManagerV4 } from "../../contracts/RoundManagerV4.sol";
import { LastBellRoundV4 } from "../../contracts/LastBellRoundV4.sol";
import { LifetimePointsVault } from "../../contracts/LifetimePointsVault.sol";

contract LastBellRoundV4Test is TestBase {
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA401);

    MockUSDG internal usdg;
    MockStockSwapAdapter internal adapter;
    RoundManagerV4 internal manager;
    MockStockToken[4] internal stocks;
    LastBellRoundV4 internal round;

    function setUp() public {
        vm.warp(1_000_000);
        usdg = new MockUSDG();
        adapter = new MockStockSwapAdapter(usdg);
        stocks[0] = new MockStockToken("NVDA");
        stocks[1] = new MockStockToken("AAPL");
        stocks[2] = new MockStockToken("TSLA");
        stocks[3] = new MockStockToken("SPY");
        for (uint8 i; i < 4; i++) {
            adapter.setRate(address(stocks[i]), 1e18);
        }
        manager = new RoundManagerV4(
            usdg, adapter, address(this), address(this), address(this)
        );
        round = _prepareAndActivate(1);
        _fund(ALICE, 1_000_000e6);
        _fund(BOB, 1_000_000e6);
        _fund(CAROL, 1_000_000e6);
    }

    function test_UncappedVariableCallsHeatFollowersAndStartTimer() public {
        _claim(ALICE, 0, 4_000e6);
        assertEq(round.tickerPoints(0), 4_000e6, "cold call is 1x");
        assertEq(round.currentMultiplierBps(0), 20_000, "heat capped");
        assertEq(round.deadline(), block.timestamp + 45, "first call starts");

        _claim(BOB, 0, 250_000e6);
        assertEq(
            round.playerTickerPoints(BOB, 0),
            500_000e6,
            "large follower gets 2x without a max"
        );
        assertEq(round.totalContributed(), 254_000e6, "all value accounted");
        assertEq(round.accountedStock(0), 254_000e18, "stock pot");
    }

    function test_VolumeCurveAndDecay() public {
        _claim(ALICE, 0, 250e6);
        assertEq(round.currentMultiplierBps(0), 12_500, "250 gives 1.25x");
        vm.warp(block.timestamp + 30);
        assertEq(round.currentMultiplierBps(0), 10_000, "volume decays");
        assertEq(round.currentMultiplierBps(1), 10_000, "ticker isolated");
    }

    function test_SettlementPaysStockBasketAndPromotesLifetimePoints() public {
        _claim(ALICE, 0, 100e6);
        _claim(BOB, 1, 50e6);
        vm.warp(round.deadline());
        manager.finalizeActive();

        assertEq(uint256(round.winningTicker()), 0, "NVDA wins");
        assertEq(round.holderPool(0), 50e18, "50 percent stock");
        assertEq(round.winningStockPool(0), 30e18, "30 percent stock");
        assertEq(round.lifetimePool(0), 10e18, "10 percent stock");
        assertEq(manager.seedAmounts(0), 5e18, "5 percent seed");
        assertEq(round.protocolPool(0), 5e18, "5 percent protocol");

        uint256 aliceBefore = stocks[0].balanceOf(ALICE);
        round.claimWinningStockRewardFor(ALICE);
        assertEq(
            stocks[0].balanceOf(ALICE) - aliceBefore, 30e18, "winner gets basket slice"
        );
        round.claimHolderRewardFor(BOB);
        assertEq(stocks[0].balanceOf(BOB), 50e18, "holder gets basket");

        LifetimePointsVault vault = manager.lifetimeVault();
        (uint256 active, uint256 pending) = vault.pointsOf(ALICE);
        assertEq(active, 100e6, "settled points active");
        assertEq(pending, 0, "no pending after settlement");
    }

    function test_LifetimePointsEarnNextRoundAndNeverBurn() public {
        _claim(ALICE, 0, 100e6);
        _claim(BOB, 1, 100e6);
        vm.warp(round.deadline());
        manager.finalizeActive();
        LastBellRoundV4 second = _prepareAndActivate(2);
        round = second;
        _claim(CAROL, 0, 100e6);
        vm.warp(round.deadline());
        manager.finalizeActive();

        LifetimePointsVault vault = manager.lifetimeVault();
        address[] memory tokens = new address[](1);
        tokens[0] = address(stocks[0]);
        uint256 before = stocks[0].balanceOf(ALICE);
        vault.claimFor(ALICE, tokens);
        assertTrue(stocks[0].balanceOf(ALICE) > before, "lifetime reward paid");
        (uint256 active,) = vault.pointsOf(ALICE);
        assertEq(active, 100e6, "claim does not burn points");
    }

    function test_TreasuryRotationOnlyAffectsFutureRounds() public {
        address nextTreasury = address(0x7EA5);
        _claim(ALICE, 0, 100e6);
        vm.warp(round.deadline());
        manager.finalizeActive();
        LastBellRoundV4 prepared = _prepare(2);

        manager.proposeTreasury(nextTreasury);
        vm.prank(nextTreasury);
        manager.acceptTreasury();

        assertEq(prepared.treasury(), address(this), "prepared treasury changed");
        assertEq(manager.treasury(), nextTreasury, "manager treasury not rotated");

        uint256[4] memory zeroes;
        manager.activatePrepared(zeroes, zeroes, uint64(block.timestamp + 30));
        round = prepared;
        _claim(BOB, 0, 100e6);
        vm.warp(round.deadline());
        manager.finalizeActive();
        LastBellRoundV4 future = _prepare(3);
        assertEq(future.treasury(), nextTreasury, "future round kept old treasury");
    }

    function test_CancelRefundsPurchasedStockAndDiscardsPoints() public {
        _claim(ALICE, 2, 25e6);
        manager.cancelActive("TEST_CANCEL");
        uint256 before = stocks[2].balanceOf(ALICE);
        round.claimCancellationRefundFor(ALICE);
        assertEq(stocks[2].balanceOf(ALICE) - before, 25e18, "stock output refunded");
        (uint256 active, uint256 pending) = manager.lifetimeVault().pointsOf(ALICE);
        assertEq(active, 0, "cancel earns no active points");
        assertEq(pending, 0, "cancel discards pending points");
    }

    function test_FailedSwapIsAtomicAndDoesNotTakeBell() public {
        adapter.setFailSwaps(true);
        vm.startPrank(ALICE);
        vm.expectRevert();
        round.claimBell(0, 10e6, 10e18, uint64(block.timestamp + 30), 4);
        vm.stopPrank();
        assertEq(round.totalContributed(), 0, "nothing charged");
        assertEq(round.holder(), address(0), "bell unchanged");
        assertEq(round.tickerPoints(0), 0, "no points");
    }

    function test_ChangedRosterRebalancesSeedEquallyBeforeActivation() public {
        _claim(ALICE, 0, 100e6);
        vm.warp(round.deadline());
        manager.finalizeActive();
        assertEq(manager.seedAmounts(0), 5e18, "old seed retained");

        MockStockToken[4] memory nextStocks;
        LastBellRoundV4.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            nextStocks[i] = new MockStockToken("NEXT");
            adapter.setRate(address(nextStocks[i]), 1e18);
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: bytes32("NEXT"),
                assetId: keccak256(abi.encode("NEXT", i)),
                token: address(nextStocks[i])
            });
        }
        LastBellRoundV4.RoundSettings memory settings = LastBellRoundV4.RoundSettings({
            roundId: 2,
            startDuration: 45,
            extensionDuration: 2,
            rugDuration: 10,
            hardCapDuration: 180,
            heatTarget: 4_000e6,
            producerPassRequired: false
        });
        LastBellRoundV4 next = manager.prepareRound(settings, tickers);
        uint256[4] memory zeroes;
        manager.activatePrepared(zeroes, zeroes, type(uint64).max);

        for (uint8 i; i < 4; i++) {
            assertEq(next.accountedStock(i), 1.25e18, "seed split by equal USDG value");
        }
        assertEq(stocks[0].balanceOf(address(manager)), 0, "old roster seed fully sold");
    }

    function test_MarketConfigurationLocksBeforeAndAfterRosterPreparation() public {
        assertTrue(!manager.marketConfigurationAllowed(), "active round locks catalog");
        _claim(ALICE, 0, 10e6);
        vm.warp(round.deadline());
        manager.finalizeActive();
        assertTrue(manager.marketConfigurationAllowed(), "settlement opens window");

        LastBellRoundV4.RoundSettings memory settings = LastBellRoundV4.RoundSettings({
            roundId: 2,
            startDuration: 45,
            extensionDuration: 2,
            rugDuration: 10,
            hardCapDuration: 180,
            heatTarget: 4_000e6,
            producerPassRequired: false
        });
        LastBellRoundV4.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            (bytes32 symbol, bytes32 assetId, address token) = round.tickerConfigs(i);
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: symbol, assetId: assetId, token: token
            });
        }
        manager.prepareRound(settings, tickers);
        assertTrue(
            !manager.marketConfigurationAllowed(), "prepared roster locks catalog"
        );
    }

    function test_ManagerRejectsDuplicateOrUnsupportedRosterTokens() public {
        _claim(ALICE, 0, 10e6);
        vm.warp(round.deadline());
        manager.finalizeActive();
        LastBellRoundV4.RoundSettings memory settings = LastBellRoundV4.RoundSettings({
            roundId: 2,
            startDuration: 45,
            extensionDuration: 2,
            rugDuration: 10,
            hardCapDuration: 180,
            heatTarget: 4_000e6,
            producerPassRequired: false
        });
        LastBellRoundV4.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            (bytes32 symbol, bytes32 assetId, address token) = round.tickerConfigs(i);
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: symbol, assetId: assetId, token: token
            });
        }
        tickers[3] = tickers[0];
        vm.expectRevert(RoundManagerV4.InvalidTransition.selector);
        manager.prepareRound(settings, tickers);

        MockStockToken unsupported = new MockStockToken("UNSUPPORTED");
        (bytes32 symbol3, bytes32 assetId3,) = round.tickerConfigs(3);
        tickers[3] = LastBellRoundV4.TickerConfig({
            symbol: symbol3, assetId: assetId3, token: address(unsupported)
        });
        vm.expectRevert(RoundManagerV4.InvalidTransition.selector);
        manager.prepareRound(settings, tickers);
    }

    function testFuzz_PointsMonotonicAndCapped(uint256 amount) public {
        amount = bound(amount, 1e6, 500_000e6);
        _claim(ALICE, 0, amount);
        uint16 multiplier = round.currentMultiplierBps(0);
        assertTrue(multiplier >= 10_000, "at least 1x");
        assertTrue(multiplier <= 20_000, "at most 2x");
    }

    function _prepareAndActivate(uint256 id)
        internal
        returns (LastBellRoundV4 deployed)
    {
        deployed = _prepare(id);
        uint256[4] memory zeroes;
        manager.activatePrepared(zeroes, zeroes, uint64(block.timestamp + 30));
    }

    function _prepare(uint256 id) internal returns (LastBellRoundV4 deployed) {
        LastBellRoundV4.RoundSettings memory settings = LastBellRoundV4.RoundSettings({
            roundId: id,
            startDuration: 45,
            extensionDuration: 2,
            rugDuration: 10,
            hardCapDuration: 180,
            heatTarget: 4_000e6,
            producerPassRequired: false
        });
        LastBellRoundV4.TickerConfig[4] memory tickers;
        bytes32[4] memory symbols =
            [bytes32("NVDA"), bytes32("AAPL"), bytes32("TSLA"), bytes32("SPY")];
        for (uint8 i; i < 4; i++) {
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: symbols[i],
                assetId: keccak256(abi.encode(symbols[i])),
                token: address(stocks[i])
            });
        }
        deployed = manager.prepareRound(settings, tickers);
    }

    function _fund(address player, uint256 amount) internal {
        usdg.mint(player, amount);
        address router = address(manager.paymentRouter());
        vm.prank(player);
        usdg.approve(router, type(uint256).max);
    }

    function _claim(address player, uint8 ticker, uint256 amount) internal {
        uint256 quote = adapter.quoteUsdgForStock(address(stocks[ticker]), amount);
        vm.prank(player);
        round.claimBell(ticker, amount, quote, type(uint64).max, type(uint8).max);
    }
}
