// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { TestBase, Vm } from "./TestBase.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { MockStockToken } from "../../contracts/mocks/MockStockToken.sol";
import { MockStockSwapAdapter } from "../../contracts/mocks/MockStockSwapAdapter.sol";
import { RoundManagerV4 } from "../../contracts/RoundManagerV4.sol";
import { LastBellRoundV4 } from "../../contracts/LastBellRoundV4.sol";

contract LastBellV4InvariantHandler {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockUSDG public immutable usdg;
    MockStockSwapAdapter public immutable adapter;
    RoundManagerV4 public immutable manager;
    MockStockToken[4] public stocks;
    address[8] public actors;
    LastBellRoundV4 public round;
    LastBellRoundV4[] public completedRounds;
    uint256 public nextRoundId = 2;
    bool public violation;

    constructor() {
        vm.warp(1_000_000);
        usdg = new MockUSDG();
        adapter = new MockStockSwapAdapter(usdg);
        for (uint8 i; i < 4; i++) {
            stocks[i] = new MockStockToken("INVARIANT");
            adapter.setRate(address(stocks[i]), 1e18);
        }
        manager = new RoundManagerV4(
            usdg, adapter, address(this), address(this), address(this)
        );
        round = _prepareAndActivate(1);
        address router = address(manager.paymentRouter());
        for (uint8 i; i < actors.length; i++) {
            address actor = address(uint160(0x1000 + i));
            actors[i] = actor;
            usdg.mint(actor, 1_000_000_000e6);
            vm.prank(actor);
            usdg.approve(router, type(uint256).max);
        }
    }

    function buy(
        uint256 actorSeed,
        uint256 tickerSeed,
        uint256 amountSeed,
        uint256 modeSeed,
        uint256 warpSeed
    ) external {
        _rollIfNeeded();
        vm.warp(block.timestamp + (warpSeed % 8));
        LastBellRoundV4.Phase phase = round.currentPhase();
        if (
            phase != LastBellRoundV4.Phase.Scheduled
                && phase != LastBellRoundV4.Phase.Live
                && phase != LastBellRoundV4.Phase.Rug
        ) return;

        address actor = actors[actorSeed % actors.length];
        uint8 ticker = uint8(tickerSeed % 4);
        uint256 amount = 1e6 + (amountSeed % 1_000_000e6);
        uint8 mode = uint8(modeSeed % 8);
        adapter.setFillBps(mode == 7 ? 2_500 : 10_000);
        uint256 quote = adapter.quoteUsdgForStock(address(stocks[ticker]), amount);
        uint8 submittedTicker = ticker;
        uint256 submittedAmount = amount;
        uint256 minimumOut = quote;
        uint64 quoteDeadline = uint64(block.timestamp + 60);
        if (actor == round.holder()) actor = actors[(actorSeed + 1) % actors.length];
        if (mode == 1) submittedTicker = 4;
        if (mode == 2) submittedAmount = 1e6 - 1;
        if (mode == 3) minimumOut = quote + 1;
        if (mode == 4) quoteDeadline = uint64(block.timestamp - 1);
        if (mode == 5 && round.holder() != address(0)) actor = round.holder();
        if (mode == 6) adapter.setFailSwaps(true);
        if (mode == 7) minimumOut = 1;

        address holderBefore = round.holder();
        uint256 totalBefore = round.totalContributed();
        uint256 claimsBefore = round.acceptedClaims();
        uint64 deadlineBefore = round.deadline();
        uint256 balanceBefore = usdg.balanceOf(actor);
        vm.prank(actor);
        (bool success,) = address(round)
            .call(
                abi.encodeCall(
                    LastBellRoundV4.claimBell,
                    (
                        submittedTicker,
                        submittedAmount,
                        minimumOut,
                        quoteDeadline,
                        type(uint8).max
                    )
                )
            );
        if (mode == 6) adapter.setFailSwaps(false);
        if (!success) {
            if (
                round.holder() != holderBefore
                    || round.totalContributed() != totalBefore
                    || round.acceptedClaims() != claimsBefore
                    || round.deadline() != deadlineBefore
                    || usdg.balanceOf(actor) != balanceBefore
            ) violation = true;
        }
    }

    function advance(uint256 secondsSeed) external {
        vm.warp(block.timestamp + (secondsSeed % 240));
    }

    function lifecycle(uint256 choice) external {
        LastBellRoundV4.Phase phase = round.currentPhase();
        if (phase == LastBellRoundV4.Phase.Finalizing) {
            manager.finalizeActive();
            completedRounds.push(round);
            return;
        }
        if (
            choice % 11 == 0
                && (phase == LastBellRoundV4.Phase.Scheduled
                    || phase == LastBellRoundV4.Phase.Live
                    || phase == LastBellRoundV4.Phase.Rug)
        ) {
            manager.cancelActive("INVARIANT_CANCEL");
            completedRounds.push(round);
            return;
        }
        _rollIfNeeded();
    }

    function claim(uint256 actorSeed, uint256 roundSeed, uint256 kindSeed) external {
        if (completedRounds.length == 0) return;
        address actor = actors[actorSeed % actors.length];
        LastBellRoundV4 target = completedRounds[roundSeed % completedRounds.length];
        uint8 kind = uint8(kindSeed % 3);
        if (kind == 0) {
            target.claimHolderRewardFor(actor);
        } else if (kind == 1) {
            target.claimWinningStockRewardFor(actor);
        } else {
            target.claimCancellationRefundFor(actor);
        }
    }

    function invalidManager(uint256 choice) external {
        uint8 mode = uint8(choice % 4);
        if (mode == 0) {
            (bool success,) =
                address(manager).call(abi.encodeCall(manager.finalizeActive, ()));
            if (success && round.currentPhase() != LastBellRoundV4.Phase.Settled) {
                violation = true;
            }
        } else if (mode == 1) {
            address attacker = actors[choice % actors.length];
            vm.prank(attacker);
            (bool success,) =
                address(manager).call(abi.encodeCall(manager.setKeeper, (attacker)));
            if (success) violation = true;
        } else if (mode == 2) {
            address attacker = actors[choice % actors.length];
            vm.prank(attacker);
            (bool success,) = address(manager.paymentRouter())
                .call(
                    abi.encodeWithSignature(
                        "pull(address,address,uint256)", attacker, attacker, 1e6
                    )
                );
            if (success) violation = true;
        } else {
            _rollIfNeeded();
        }
    }

    function _rollIfNeeded() internal {
        LastBellRoundV4.Phase phase = round.currentPhase();
        if (
            phase != LastBellRoundV4.Phase.Settled
                && phase != LastBellRoundV4.Phase.Cancelled
        ) return;
        round = _prepareAndActivate(nextRoundId++);
    }

    function _prepareAndActivate(uint256 id)
        internal
        returns (LastBellRoundV4 deployed)
    {
        LastBellRoundV4.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: bytes32("INVARIANT"),
                assetId: keccak256(abi.encode("INVARIANT", i)),
                token: address(stocks[i])
            });
        }
        deployed = manager.prepareRound(
            LastBellRoundV4.RoundSettings({
                roundId: id,
                startDuration: 300,
                extensionDuration: 2,
                rugDuration: 10,
                hardCapDuration: 600,
                heatTarget: 4_000e6,
                producerPassRequired: false
            }),
            tickers
        );
        uint256[4] memory zeroes;
        manager.activatePrepared(zeroes, zeroes, type(uint64).max);
    }
}

contract LastBellV4InvariantTest is TestBase {
    LastBellV4InvariantHandler internal handler;
    address[] internal invariantTargets;

    function setUp() public {
        handler = new LastBellV4InvariantHandler();
        invariantTargets.push(address(handler));
    }

    function targetContracts() external view returns (address[] memory) {
        return invariantTargets;
    }

    function invariant_AllCoreProperties() public view {
        assertTrue(!handler.violation(), "atomicity or authorization violation");
        LastBellRoundV4 current = handler.round();
        uint256 paidSum;
        uint256[4] memory pointSums;
        for (uint8 actorIndex; actorIndex < 8; actorIndex++) {
            address actor = handler.actors(actorIndex);
            paidSum += current.paid(actor);
            for (uint8 ticker; ticker < 4; ticker++) {
                pointSums[ticker] += current.playerTickerPoints(actor, ticker);
            }
        }
        assertEq(paidSum, current.totalContributed(), "USDG model mismatch");
        assertEq(
            current.totalUsdgDeposited(),
            current.totalUsdgConsumed() + current.accountedUsdg(),
            "deposited USDG does not equal consumed plus residual"
        );
        for (uint8 ticker; ticker < 4; ticker++) {
            assertEq(
                pointSums[ticker],
                current.tickerPoints(ticker),
                "ticker point model mismatch"
            );
        }
        if (current.startedAt() == 0) {
            assertEq(current.deadline(), 0, "scheduled deadline");
            assertEq(current.hardEnd(), 0, "scheduled hard end");
        } else {
            assertTrue(
                current.deadline() <= current.hardEnd(), "deadline beyond hard end"
            );
        }
    }
}
