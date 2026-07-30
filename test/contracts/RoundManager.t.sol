// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { RoundManager } from "../../contracts/RoundManager.sol";
import { LastBellRound } from "../../contracts/LastBellRound.sol";
import {
    MockMarketDataVerifier
} from "../../contracts/mocks/MockMarketDataVerifier.sol";
import { MockStockToken } from "../../contracts/mocks/MockStockToken.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { TestBase } from "./TestBase.sol";

contract RoundManagerTest is TestBase {
    MockUSDG internal token;
    MockMarketDataVerifier internal verifier;
    RoundManager internal manager;
    LastBellRound.TickerConfig[4] internal tickers;

    function setUp() public {
        token = new MockUSDG();
        verifier = new MockMarketDataVerifier();
        manager = new RoundManager(
            token, verifier, address(this), address(this), address(0x7EA5)
        );
        for (uint8 i; i < 4; i++) {
            MockStockToken stock = new MockStockToken("MOCK");
            tickers[i] = LastBellRound.TickerConfig(
                bytes32(uint256(i + 1)), address(stock), bytes32(uint256(i + 1))
            );
        }
    }

    function test_PreparesActivatesAndCarriesSeedExactlyOnce() public {
        token.mint(address(manager), 50e6);
        LastBellRound first = _prepare(1);
        bytes[4] memory reports;
        manager.activatePrepared(reports);
        assertEq(address(manager.activeRound()), address(first), "active first");
        assertEq(first.pot(), 50e6, "initial seed");

        address player = address(0xA11CE);
        token.mint(player, 10e6);
        address router = address(manager.paymentRouter());
        vm.prank(player);
        token.approve(router, type(uint256).max);
        vm.prank(player);
        first.claimBell(0, "", type(uint8).max);
        vm.warp(first.deadline());
        manager.finalizeActive();

        LastBellRound second = _prepare(2);
        manager.activatePrepared(reports);
        assertEq(address(manager.activeRound()), address(second), "active second");
        assertEq(second.pot(), first.pot() * 1_500 / 10_000, "seed carried");
        assertEq(first.nextRoundPool(), 0, "seed consumed once");
    }

    function test_RejectsDuplicatePreparedRound() public {
        _prepare(1);
        vm.expectRevert(RoundManager.InvalidTransition.selector);
        _prepare(2);
    }

    function _prepare(uint256 id) internal returns (LastBellRound round) {
        LastBellRound.RoundSettings memory settings = LastBellRound.RoundSettings({
            roundId: id,
            claimPrice: 1e6,
            startDuration: 45,
            extensionDuration: 2,
            rugDuration: 10,
            hardCapDuration: 180,
            maxReportAge: 3,
            marketThresholdBps: 5,
            greenMultiplierBps: 12_500,
            flatMultiplierBps: 10_000,
            redMultiplierBps: 7_500,
            marketMode: LastBellRound.MarketMode.Flat,
            producerPassRequired: false
        });
        LastBellRound.TickerConfig[4] memory memoryTickers = tickers;
        round = manager.prepareRound(settings, memoryTickers);
    }
}
