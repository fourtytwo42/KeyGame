// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRound } from "../../contracts/LastBellRound.sol";
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
    LastBellRound internal round;

    function setUp() public {
        token = new MockUSDG();
        bytes32[4] memory symbols =
            [bytes32("NVDA"), bytes32("AAPL"), bytes32("TSLA"), bytes32("SPY")];
        round = new LastBellRound(
            token, address(this), TREASURY, 4663, UNIT, 45, 2, 10, 180, symbols
        );
        token.mint(address(this), SEED);
        token.approve(address(round), SEED);
        round.start(SEED);
    }

    function test_StartsWithExactBoundsAndSeed() public view {
        assertEq(uint256(round.deadline() - round.startedAt()), 45, "initial duration");
        assertEq(uint256(round.hardEnd() - round.startedAt()), 180, "hard duration");
        assertEq(round.pot(), SEED, "seed pot");
        assertEq(
            uint256(round.currentPhase()),
            uint256(LastBellRound.Phase.Live),
            "live phase"
        );
    }

    function test_JoinLocksFaction() public {
        _join(ALICE, 2);
        assertEq(uint256(round.factionOf(ALICE)), 2, "selected faction");
        vm.prank(ALICE);
        vm.expectRevert(LastBellRound.AlreadyJoined.selector);
        round.joinFaction(1);
    }

    function test_CanJoinScheduledRoundBeforeStart() public {
        MockUSDG nextToken = new MockUSDG();
        bytes32[4] memory symbols =
            [bytes32("NVDA"), bytes32("AAPL"), bytes32("TSLA"), bytes32("SPY")];
        LastBellRound nextRound = new LastBellRound(
            nextToken, address(this), TREASURY, 4664, UNIT, 45, 2, 10, 180, symbols
        );
        vm.prank(ALICE);
        nextRound.joinFaction(0);
        assertEq(uint256(nextRound.factionOf(ALICE)), 0, "scheduled entry");
    }

    function test_AllowanceControlsAcceptedClaims() public {
        token.mint(ALICE, 10 * UNIT);
        token.mint(BOB, 10 * UNIT);
        vm.startPrank(ALICE);
        token.approve(address(round), 2 * UNIT);
        round.joinFaction(0);
        vm.stopPrank();
        vm.startPrank(BOB);
        token.approve(address(round), 10 * UNIT);
        round.joinFaction(1);
        vm.stopPrank();

        vm.prank(ALICE);
        round.claimBell();
        vm.prank(BOB);
        round.claimBell();
        vm.prank(ALICE);
        round.claimBell();
        vm.prank(BOB);
        round.claimBell();
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "ALLOWANCE"));
        round.claimBell();

        assertEq(round.paid(ALICE), 2 * UNIT, "allowance exhausted");
    }

    function test_NormalClaimAddsTwoSecondsAndCollectsOneDollar() public {
        _join(ALICE, 0);
        uint64 beforeDeadline = round.deadline();

        vm.prank(ALICE);
        round.claimBell();

        assertEq(round.holder(), ALICE, "holder");
        assertEq(uint256(round.deadline()), beforeDeadline + 2, "extension");
        assertEq(round.pot(), SEED + UNIT, "pot");
        assertEq(round.paid(ALICE), UNIT, "paid");
    }

    function test_RugZoneClaimChangesHolderWithoutExtension() public {
        _join(ALICE, 0);
        _join(BOB, 1);
        vm.prank(ALICE);
        round.claimBell();
        vm.warp(round.deadline() - 10);
        uint64 beforeDeadline = round.deadline();

        vm.prank(BOB);
        round.claimBell();

        assertEq(round.holder(), BOB, "new holder");
        assertEq(uint256(round.deadline()), beforeDeadline, "no rug extension");
        assertEq(
            uint256(round.currentPhase()), uint256(LastBellRound.Phase.Rug), "rug phase"
        );
    }

    function test_CurrentHolderCannotSelfClaim() public {
        _join(ALICE, 0);
        vm.startPrank(ALICE);
        round.claimBell();
        vm.expectRevert(LastBellRound.CurrentHolder.selector);
        round.claimBell();
        vm.stopPrank();
    }

    function test_DeadlineNeverCrossesHardEnd() public {
        _join(ALICE, 0);
        _join(BOB, 1);
        for (uint256 index; index < 80; index++) {
            vm.prank(index % 2 == 0 ? ALICE : BOB);
            round.claimBell();
        }
        assertEq(uint256(round.deadline()), uint256(round.hardEnd()), "hard cap");
    }

    function testFuzz_RugClaimsNeverExtend(uint256 secondsIntoRug) public {
        _join(ALICE, 0);
        _join(BOB, 1);
        vm.prank(ALICE);
        round.claimBell();
        uint256 secondsRemaining = bound(secondsIntoRug, 1, 10);
        vm.warp(round.deadline() - secondsRemaining);
        uint64 beforeDeadline = round.deadline();

        vm.prank(BOB);
        round.claimBell();
        assertEq(uint256(round.deadline()), beforeDeadline, "rug fuzz extension");
    }

    function test_SettlementConservesPotAndPaysPullRewards() public {
        _join(ALICE, 0);
        _join(BOB, 1);
        vm.prank(ALICE);
        round.claimBell();
        vm.warp(block.timestamp + 12);
        vm.prank(BOB);
        round.claimBell();
        vm.warp(round.deadline());

        round.finalize();

        assertEq(round.payoutSum(), round.pot(), "payout conservation");
        assertEq(round.holderPool(), (round.pot() * 50) / 100, "holder share");
        assertEq(round.factionPool(), (round.pot() * 30) / 100, "faction share");
        assertEq(
            uint256(round.currentPhase()),
            uint256(LastBellRound.Phase.Settled),
            "settled phase"
        );

        uint256 holderBefore = token.balanceOf(BOB);
        vm.prank(BOB);
        round.claimHolderReward();
        assertEq(
            token.balanceOf(BOB) - holderBefore,
            round.holderPool(),
            "holder pull reward"
        );
        vm.prank(BOB);
        vm.expectRevert(LastBellRound.NothingToClaim.selector);
        round.claimHolderReward();
    }

    function test_WinningFactionRewardUsesAirtime() public {
        _join(ALICE, 0);
        _join(BOB, 0);
        _join(CAROL, 1);
        vm.prank(ALICE);
        round.claimBell();
        vm.warp(block.timestamp + 5);
        vm.prank(BOB);
        round.claimBell();
        vm.warp(block.timestamp + 5);
        vm.prank(CAROL);
        round.claimBell();
        vm.warp(round.deadline());
        round.finalize();

        assertEq(uint256(round.winningFaction()), 1, "airtime winner");
        uint256 beforeReward = token.balanceOf(CAROL);
        vm.prank(CAROL);
        round.claimFactionReward();
        assertEq(
            token.balanceOf(CAROL) - beforeReward,
            round.factionPool(),
            "only faction controller gets full share"
        );
    }

    function test_CancellationRefundsClaimsOnce() public {
        _join(ALICE, 0);
        uint256 beforeClaim = token.balanceOf(ALICE);
        vm.prank(ALICE);
        round.claimBell();
        round.cancel("OPERATOR_TEST");

        vm.prank(ALICE);
        round.claimCancellationRefund();
        assertEq(token.balanceOf(ALICE), beforeClaim, "claim refunded");
        vm.prank(ALICE);
        vm.expectRevert(LastBellRound.NothingToClaim.selector);
        round.claimCancellationRefund();
    }

    function _join(address player, uint8 faction) internal {
        token.mint(player, 100 * UNIT);
        vm.startPrank(player);
        token.approve(address(round), type(uint256).max);
        round.joinFaction(faction);
        vm.stopPrank();
    }
}
