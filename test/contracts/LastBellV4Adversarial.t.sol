// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { TestBase } from "./TestBase.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { MockStockToken } from "../../contracts/mocks/MockStockToken.sol";
import {
    AdversarialStockSwapAdapter
} from "../../contracts/mocks/AdversarialStockSwapAdapter.sol";
import { RoundManagerV4 } from "../../contracts/RoundManagerV4.sol";
import { LastBellRoundV4 } from "../../contracts/LastBellRoundV4.sol";

contract LastBellV4AdversarialTest is TestBase {
    address internal constant ALICE = address(0xA11CE);

    MockUSDG internal usdg;
    AdversarialStockSwapAdapter internal adapter;
    RoundManagerV4 internal manager;
    MockStockToken[4] internal stocks;
    LastBellRoundV4 internal round;

    function setUp() public {
        vm.warp(1_000_000);
        usdg = new MockUSDG();
        adapter = new AdversarialStockSwapAdapter(usdg);
        for (uint8 i; i < 4; i++) {
            stocks[i] = new MockStockToken("HOSTILE");
            adapter.setRate(address(stocks[i]), 1e18);
        }
        manager = new RoundManagerV4(
            usdg, adapter, address(this), address(this), address(this)
        );
        round = _activate(1);
        usdg.mint(ALICE, 1_000_000e6);
        address router = address(manager.paymentRouter());
        vm.prank(ALICE);
        usdg.approve(router, type(uint256).max);
    }

    function test_RevertingLyingAndPartialAdaptersCannotChargeOrTakeBell() public {
        AdversarialStockSwapAdapter.Mode[3] memory modes = [
            AdversarialStockSwapAdapter.Mode.RevertBuy,
            AdversarialStockSwapAdapter.Mode.LieAboutBuyOutput,
            AdversarialStockSwapAdapter.Mode.DeliverPartialBuy
        ];
        for (uint256 i; i < modes.length; i++) {
            adapter.configure(modes[i], address(0), "");
            uint256 before = usdg.balanceOf(ALICE);
            vm.prank(ALICE);
            vm.expectRevert();
            round.claimBell(0, 10e6, 10e18, uint64(block.timestamp + 60), 255);
            assertEq(usdg.balanceOf(ALICE), before, "USDG changed");
            assertEq(round.holder(), address(0), "holder changed");
            assertEq(round.totalContributed(), 0, "contribution changed");
        }
    }

    function test_ReentrantAdapterCannotEnterClaimBell() public {
        bytes memory callback = abi.encodeCall(
            LastBellRoundV4.claimBell, (0, 1e6, 1e18, uint64(block.timestamp + 60), 255)
        );
        adapter.configure(
            AdversarialStockSwapAdapter.Mode.Reenter, address(round), callback
        );
        vm.prank(ALICE);
        round.claimBell(0, 10e6, 10e18, uint64(block.timestamp + 60), 255);
        assertEq(round.acceptedClaims(), 1, "reentrant claim was accepted");
        assertEq(round.totalContributed(), 10e6, "wrong contribution");
    }

    function test_ChangedRosterSellFailureLeavesPreparedRoundRetryable() public {
        adapter.configure(AdversarialStockSwapAdapter.Mode.Normal, address(0), "");
        vm.prank(ALICE);
        round.claimBell(0, 100e6, 100e18, type(uint64).max, 255);
        vm.warp(round.deadline());
        manager.finalizeActive();

        LastBellRoundV4.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            MockStockToken next = new MockStockToken("NEXT");
            adapter.setRate(address(next), 1e18);
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: bytes32("NEXT"),
                assetId: keccak256(abi.encode("NEXT", i)),
                token: address(next)
            });
        }
        LastBellRoundV4.RoundSettings memory settings = _settings(2);
        LastBellRoundV4 prepared = manager.prepareRound(settings, tickers);
        adapter.configure(AdversarialStockSwapAdapter.Mode.RevertSell, address(0), "");
        uint256[4] memory zeroes;
        vm.expectRevert();
        manager.activatePrepared(zeroes, zeroes, type(uint64).max);
        assertEq(
            address(manager.preparedRound()),
            address(prepared),
            "prepared round was lost"
        );
        adapter.configure(AdversarialStockSwapAdapter.Mode.Normal, address(0), "");
        manager.activatePrepared(zeroes, zeroes, type(uint64).max);
        assertEq(
            address(manager.activeRound()), address(prepared), "retry did not activate"
        );
    }

    function _activate(uint256 id) internal returns (LastBellRoundV4 deployed) {
        LastBellRoundV4.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: bytes32("HOSTILE"),
                assetId: keccak256(abi.encode("HOSTILE", i)),
                token: address(stocks[i])
            });
        }
        deployed = manager.prepareRound(_settings(id), tickers);
        uint256[4] memory zeroes;
        manager.activatePrepared(zeroes, zeroes, type(uint64).max);
    }

    function _settings(uint256 id)
        internal
        pure
        returns (LastBellRoundV4.RoundSettings memory)
    {
        return LastBellRoundV4.RoundSettings({
            roundId: id,
            startDuration: 45,
            extensionDuration: 2,
            rugDuration: 10,
            hardCapDuration: 180,
            heatTarget: 4_000e6,
            producerPassRequired: false
        });
    }
}
