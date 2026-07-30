// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRound } from "../../contracts/LastBellRound.sol";
import { PaymentRouter } from "../../contracts/PaymentRouter.sol";
import {
    MockMarketDataVerifier
} from "../../contracts/mocks/MockMarketDataVerifier.sol";
import { MockStockToken } from "../../contracts/mocks/MockStockToken.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { TestBase } from "./TestBase.sol";

contract LastBellRoundTest is TestBase {
    uint256 internal constant UNIT = 1e6;
    uint256 internal constant SEED = 50e6;
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant CAROL = address(0xCA901);
    address internal constant TREASURY = address(0x7EA5);

    MockUSDG internal token;
    PaymentRouter internal paymentRouter;
    MockMarketDataVerifier internal verifier;
    MockStockToken[4] internal stocks;
    bytes32[4] internal feeds;
    uint256[4] internal opening = [uint256(100e8), 200e8, 250e8, 500e8];
    LastBellRound internal round;

    function setUp() public {
        token = new MockUSDG();
        paymentRouter = new PaymentRouter(token, address(this));
        verifier = new MockMarketDataVerifier();
        stocks[0] = new MockStockToken("NVDA");
        stocks[1] = new MockStockToken("AAPL");
        stocks[2] = new MockStockToken("TSLA");
        stocks[3] = new MockStockToken("SPY");
        feeds = [
            keccak256("NVDA/USD"),
            keccak256("AAPL/USD"),
            keccak256("TSLA/USD"),
            keccak256("SPY/USD")
        ];
        round = _deploy(LastBellRound.MarketMode.Dex, false);
        token.mint(address(this), SEED);
        token.approve(address(paymentRouter), SEED);
        bytes[4] memory reports;
        for (uint8 index; index < 4; index++) {
            reports[index] = _report(index, opening[index], uint64(block.timestamp));
        }
        round.start(SEED, reports);
    }

    function test_InitializationWaitsForFirstPaidClaim() public view {
        assertTrue(round.initialized(), "initialized");
        assertEq(round.startedAt(), 0, "timer not started");
        assertEq(round.deadline(), 0, "no deadline");
        assertEq(round.hardEnd(), 0, "no hard end");
        assertEq(round.openingPrices(2), opening[2], "opening price");
        assertEq(round.pot(), SEED, "seed");
    }

    function test_FirstPaidClaimStartsExactClockWithoutExtension() public {
        _fund(ALICE);
        uint64 acceptedAt = uint64(block.timestamp);
        vm.prank(ALICE);
        round.claimBell(0, _freshReport(0, 100_060_000_00), 4);

        assertEq(round.startedAt(), acceptedAt, "started by first claim");
        assertEq(round.deadline(), acceptedAt + 45, "initial clock");
        assertEq(round.hardEnd(), acceptedAt + 180, "hard cap");
        assertEq(round.acceptedClaims(), 1, "opening claim accepted");
        assertEq(round.pot(), SEED + UNIT, "opening fee added");
    }

    function test_CannotClaimBeforeOperatorInitialization() public {
        LastBellRound waiting = _deploy(LastBellRound.MarketMode.Dex, false);
        _fund(ALICE);
        vm.expectRevert(LastBellRound.RoundNotInitialized.selector);
        vm.prank(ALICE);
        waiting.claimBell(0, _freshReport(0, 100_060_000_00), 4);
    }

    function test_CannotInitializeTwice() public {
        bytes[4] memory reports;
        for (uint8 index; index < 4; index++) {
            reports[index] = _report(index, opening[index], uint64(block.timestamp));
        }
        vm.expectRevert(LastBellRound.AlreadyInitialized.selector);
        round.start(0, reports);
    }

    function test_ClaimSelectsTickerAndCanSwitchNextClaim() public {
        _fund(ALICE);
        _fund(BOB);
        vm.prank(ALICE);
        round.claimBell(0, _freshReport(0, 100_060_000_00), 4);
        uint64 nextReportAt = round.startedAt() + 4;
        vm.warp(nextReportAt);
        bytes memory bobReport = _report(2, 249_800_000_00, nextReportAt);
        vm.prank(BOB);
        round.claimBell(2, bobReport, 4);
        assertEq(round.holder(), BOB, "holder");
        assertEq(uint256(round.holderTicker()), 2, "ticker switched");
        assertEq(
            uint256(round.holderBand()),
            uint256(LastBellRound.MarketBand.Red),
            "red band"
        );
        assertEq(round.tickerAirtime(0), 4, "raw airtime");
        assertEq(round.tickerScore(0), 50_000, "green weighted score");
    }

    function test_OneRouterApprovalWorksAcrossRounds() public {
        LastBellRound next = _deploy(LastBellRound.MarketMode.Dex, false);
        bytes[4] memory reports;
        for (uint8 index; index < 4; index++) {
            reports[index] = _report(index, opening[index], uint64(block.timestamp));
        }
        next.start(0, reports);

        _fund(ALICE);
        vm.prank(ALICE);
        round.claimBell(0, _freshReport(0, 100_060_000_00), 4);
        vm.prank(ALICE);
        next.claimBell(1, _freshReport(1, 200_010_000_00), 4);

        assertEq(round.paid(ALICE), UNIT, "first round charged");
        assertEq(next.paid(ALICE), UNIT, "next round charged");
    }

    function test_PaymentRouterRejectsUnauthorizedCallers() public {
        token.mint(ALICE, 10 * UNIT);
        vm.prank(ALICE);
        token.approve(address(paymentRouter), type(uint256).max);

        vm.expectRevert(PaymentRouter.Unauthorized.selector);
        vm.prank(BOB);
        paymentRouter.pull(ALICE, BOB, UNIT);
    }

    function test_ExactMarketBandBoundaries() public {
        _fund(ALICE);
        _fund(BOB);
        _fund(CAROL);
        vm.prank(ALICE);
        round.claimBell(0, _freshReport(0, 100_050_000_00), 4);
        assertEq(
            uint256(round.holderBand()),
            uint256(LastBellRound.MarketBand.Green),
            "green boundary"
        );
        uint64 redAt = round.startedAt() + 1;
        vm.warp(redAt);
        bytes memory redReport = _report(1, 199_900_000_00, redAt);
        vm.prank(BOB);
        round.claimBell(1, redReport, 4);
        assertEq(
            uint256(round.holderBand()),
            uint256(LastBellRound.MarketBand.Red),
            "red boundary"
        );
        uint64 flatAt = round.startedAt() + 2;
        vm.warp(flatAt);
        bytes memory flatReport = _report(3, 500_010_000_00, flatAt);
        vm.prank(CAROL);
        round.claimBell(3, flatReport, 4);
        assertEq(
            uint256(round.holderBand()),
            uint256(LastBellRound.MarketBand.Flat),
            "flat band"
        );
    }

    function test_InvalidStaleMismatchedAndReplayedReportsNeverCharge() public {
        _fund(ALICE);
        uint256 balance = token.balanceOf(ALICE);
        bytes memory valid = _freshReport(0, 100_060_000_00);
        vm.prank(ALICE);
        vm.expectRevert(LastBellRound.InvalidMarketReport.selector);
        round.claimBell(1, valid, 4);

        uint64 refreshedAt = uint64(block.timestamp) + 5;
        vm.warp(refreshedAt);
        vm.prank(ALICE);
        vm.expectRevert(LastBellRound.StaleMarketReport.selector);
        round.claimBell(0, valid, 4);

        bytes memory fresh = _report(0, 100_070_000_00, refreshedAt);
        vm.prank(ALICE);
        round.claimBell(0, fresh, 4);
        vm.warp(block.timestamp + 1);
        vm.prank(BOB);
        vm.expectRevert(LastBellRound.ReplayedMarketReport.selector);
        round.claimBell(0, fresh, 4);
        assertEq(token.balanceOf(ALICE), balance - UNIT, "only accepted fee");
    }

    function test_MissingReportCannotEscapeRedScoring() public {
        _fund(ALICE);
        vm.prank(ALICE);
        vm.expectRevert(LastBellRound.InvalidMarketReport.selector);
        round.claimBell(0, "", 4);
        assertEq(round.paid(ALICE), 0, "no fee");
    }

    function test_FlatModeAcceptsNoReportAtOneTimesScore() public {
        LastBellRound flat = _deploy(LastBellRound.MarketMode.Flat, false);
        token.mint(address(this), SEED);
        token.approve(address(paymentRouter), SEED);
        bytes[4] memory emptyReports;
        flat.start(SEED, emptyReports);
        _fund(ALICE);
        _fund(BOB);
        vm.prank(ALICE);
        flat.claimBell(0, "", 4);
        vm.warp(block.timestamp + 4);
        vm.prank(BOB);
        flat.claimBell(1, "", 4);
        assertEq(flat.tickerScore(0), 40_000, "flat score");
    }

    function test_ProducerPassIsBinaryAndRequiredOnlyForSpecialRounds() public {
        LastBellRound special = _deploy(LastBellRound.MarketMode.Flat, true);
        token.mint(address(this), SEED);
        token.approve(address(paymentRouter), SEED);
        bytes[4] memory emptyReports;
        special.start(SEED, emptyReports);
        _fund(ALICE);
        vm.prank(ALICE);
        vm.expectRevert(LastBellRound.ProducerPassRequired.selector);
        special.claimBell(0, "", 0);

        stocks[2].mint(ALICE, 1);
        vm.prank(ALICE);
        special.claimBell(0, "", 2);
        assertTrue(special.holderProducerPass(), "pass observed");
    }

    function test_RugClaimChangesHolderWithoutExtension() public {
        _fund(ALICE);
        _fund(BOB);
        vm.prank(ALICE);
        round.claimBell(0, _freshReport(0, 100_010_000_00), 4);
        uint64 rugReportAt = round.deadline() - 10;
        vm.warp(rugReportAt);
        uint64 beforeDeadline = round.deadline();
        bytes memory rugReport = _report(1, 200_010_000_00, rugReportAt);
        vm.prank(BOB);
        round.claimBell(1, rugReport, 4);
        assertEq(uint256(round.deadline()), beforeDeadline, "no rug extension");
    }

    function test_CurrentHolderCannotClaimAnotherTicker() public {
        _fund(ALICE);
        vm.startPrank(ALICE);
        round.claimBell(0, _freshReport(0, 100_010_000_00), 4);
        vm.expectRevert(LastBellRound.CurrentHolder.selector);
        round.claimBell(1, _freshReport(1, 200_010_000_00), 4);
        vm.stopPrank();
    }

    function test_WeightedTickerWinsButEveryCallerSharesAirtimePool() public {
        _fund(ALICE);
        _fund(BOB);
        _fund(CAROL);
        vm.prank(ALICE);
        round.claimBell(0, _freshReport(0, 100_060_000_00), 4);
        uint64 bobAt = round.startedAt() + 8;
        vm.warp(bobAt);
        bytes memory bobReport = _report(1, 200_010_000_00, bobAt);
        vm.prank(BOB);
        round.claimBell(1, bobReport, 4);
        uint64 carolAt = bobAt + 4;
        vm.warp(carolAt);
        bytes memory carolReport = _report(0, 100_070_000_00, carolAt);
        vm.prank(CAROL);
        round.claimBell(0, carolReport, 4);
        vm.warp(round.deadline());
        round.finalize();

        assertEq(round.payoutSum(), round.pot(), "payout conservation");
        assertEq(uint256(round.winningTicker()), 0, "weighted ticker winner");
        assertEq(round.totalControlTime(), 49, "all intervals count");

        uint256 aliceBefore = token.balanceOf(ALICE);
        vm.prank(ALICE);
        round.claimAirtimeReward();
        assertEq(
            token.balanceOf(ALICE) - aliceBefore,
            round.airtimePool() * round.controlTime(ALICE) / round.totalControlTime(),
            "alice all-ticker airtime share"
        );

        uint256 bobBefore = token.balanceOf(BOB);
        vm.prank(BOB);
        round.claimAirtimeReward();
        assertEq(
            token.balanceOf(BOB) - bobBefore,
            round.airtimePool() * round.controlTime(BOB) / round.totalControlTime(),
            "losing ticker still earns"
        );

        uint256 carolBefore = token.balanceOf(CAROL);
        vm.prank(CAROL);
        round.claimAirtimeReward();
        assertEq(
            round.airtimePoolPaid(), round.airtimePool(), "last caller receives dust"
        );
        assertEq(
            round.claimedControlTime(),
            round.totalControlTime(),
            "all control time claimed"
        );
        assertTrue(token.balanceOf(CAROL) > carolBefore, "carol paid");
    }

    function test_CancellationRefundsAcceptedFees() public {
        _fund(ALICE);
        uint256 before = token.balanceOf(ALICE);
        vm.prank(ALICE);
        round.claimBell(0, _freshReport(0, 100_010_000_00), 4);
        round.cancel("MARKET_DATA_OUTAGE");
        vm.prank(ALICE);
        round.claimCancellationRefund();
        assertEq(token.balanceOf(ALICE), before, "refunded");
    }

    function testFuzz_WeightedScoreMatchesLockedMultiplier(
        uint16 secondsHeld,
        uint8 bandSeed
    ) public {
        uint256 duration = bound(secondsHeld, 1, 20);
        _fund(ALICE);
        _fund(BOB);
        uint256 price = bandSeed % 3 == 0
            ? 100_060_000_00
            : bandSeed % 3 == 1 ? 99_940_000_00 : 100_010_000_00;
        uint256 multiplier =
            bandSeed % 3 == 0 ? 12_500 : bandSeed % 3 == 1 ? 7_500 : 10_000;
        vm.prank(ALICE);
        round.claimBell(0, _freshReport(0, price), 4);
        uint64 bobAt = round.startedAt() + uint64(duration);
        vm.warp(bobAt);
        bytes memory bobReport = _report(1, 200_010_000_00, bobAt);
        vm.prank(BOB);
        round.claimBell(1, bobReport, 4);
        assertEq(round.tickerScore(0), duration * multiplier, "locked score");
    }

    function testFuzz_DexBandsCannotChangeFinancialAllocation(
        uint16 firstSeconds,
        uint16 secondSeconds,
        uint8 firstBandSeed,
        uint8 secondBandSeed
    ) public {
        uint64 firstDuration = uint64(bound(firstSeconds, 1, 15));
        uint64 secondDuration = uint64(bound(secondSeconds, 1, 15));
        LastBellRound comparison = _deploy(LastBellRound.MarketMode.Dex, false);
        token.mint(address(this), SEED);
        token.approve(address(paymentRouter), type(uint256).max);
        bytes[4] memory reports;
        for (uint8 index; index < 4; index++) {
            reports[index] = _report(index, opening[index], uint64(block.timestamp));
        }
        comparison.start(SEED, reports);

        _fund(ALICE);
        _fund(BOB);
        _fund(CAROL);
        uint64 startAt = uint64(block.timestamp);
        vm.prank(ALICE);
        round.claimBell(0, _report(0, _bandPrice(0, firstBandSeed), startAt), 4);
        vm.prank(ALICE);
        comparison.claimBell(0, _report(0, _bandPrice(0, secondBandSeed), startAt), 4);

        vm.warp(startAt + firstDuration);
        uint64 bobAt = startAt + firstDuration;
        bytes memory firstBobReport = _report(1, _bandPrice(1, secondBandSeed), bobAt);
        bytes memory secondBobReport = _report(1, _bandPrice(1, firstBandSeed), bobAt);
        vm.prank(BOB);
        round.claimBell(1, firstBobReport, 4);
        vm.prank(BOB);
        comparison.claimBell(1, secondBobReport, 4);

        vm.warp(startAt + firstDuration + secondDuration);
        uint64 carolAt = startAt + firstDuration + secondDuration;
        uint8 firstCarolBand = uint8(uint256(firstBandSeed) + 1);
        uint8 secondCarolBand = uint8(uint256(secondBandSeed) + 1);
        bytes memory firstCarolReport =
            _report(2, _bandPrice(2, firstCarolBand), carolAt);
        bytes memory secondCarolReport =
            _report(2, _bandPrice(2, secondCarolBand), carolAt);
        vm.prank(CAROL);
        round.claimBell(2, firstCarolReport, 4);
        vm.prank(CAROL);
        comparison.claimBell(2, secondCarolReport, 4);

        vm.warp(round.deadline());
        round.finalize();
        comparison.finalize();

        assertEq(round.pot(), comparison.pot(), "same fees and seed");
        assertEq(round.holderPool(), comparison.holderPool(), "holder invariant");
        assertEq(round.airtimePool(), comparison.airtimePool(), "airtime invariant");
        assertEq(round.nextRoundPool(), comparison.nextRoundPool(), "seed invariant");
        assertEq(round.protocolPool(), comparison.protocolPool(), "protocol invariant");
        assertEq(
            round.totalControlTime(),
            comparison.totalControlTime(),
            "control-time invariant"
        );
        assertEq(
            round.controlTime(ALICE),
            comparison.controlTime(ALICE),
            "alice control invariant"
        );
        assertEq(
            round.controlTime(BOB), comparison.controlTime(BOB), "bob control invariant"
        );
        assertEq(
            round.controlTime(CAROL),
            comparison.controlTime(CAROL),
            "carol control invariant"
        );
    }

    function _bandPrice(uint8 ticker, uint8 seed) internal view returns (uint256) {
        if (seed % 3 == 0) return opening[ticker] * 10_006 / 10_000;
        if (seed % 3 == 1) return opening[ticker] * 9_994 / 10_000;
        return opening[ticker];
    }

    function _deploy(LastBellRound.MarketMode mode, bool passRequired)
        internal
        returns (LastBellRound deployed)
    {
        LastBellRound.RoundSettings memory settings = LastBellRound.RoundSettings({
            roundId: 4663,
            claimPrice: UNIT,
            startDuration: 45,
            extensionDuration: 2,
            rugDuration: 10,
            hardCapDuration: 180,
            maxReportAge: 3,
            marketThresholdBps: 5,
            greenMultiplierBps: 12_500,
            flatMultiplierBps: 10_000,
            redMultiplierBps: 7_500,
            marketMode: mode,
            producerPassRequired: passRequired
        });
        LastBellRound.TickerConfig[4] memory configs;
        for (uint8 index; index < 4; index++) {
            configs[index] = LastBellRound.TickerConfig(
                index == 0
                    ? bytes32("NVDA")
                    : index == 1
                        ? bytes32("AAPL")
                        : index == 2 ? bytes32("TSLA") : bytes32("SPY"),
                address(stocks[index]),
                feeds[index]
            );
        }
        deployed = new LastBellRound(
            token, paymentRouter, verifier, address(this), TREASURY, settings, configs
        );
        paymentRouter.setRoundAuthorization(address(deployed), true);
    }

    function _fund(address player) internal {
        token.mint(player, 100 * UNIT);
        vm.prank(player);
        token.approve(address(paymentRouter), type(uint256).max);
    }

    function _freshReport(uint8 ticker, uint256 price)
        internal
        view
        returns (bytes memory)
    {
        return _report(ticker, price, uint64(block.timestamp));
    }

    function _report(uint8 ticker, uint256 price, uint64 observedAt)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(feeds[ticker], price, observedAt, observedAt, observedAt + 30);
    }
}
