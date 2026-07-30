// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "../contracts/interfaces/IERC20.sol";
import { IMarketDataVerifier } from "../contracts/interfaces/IMarketDataVerifier.sol";
import { LastBellRound } from "../contracts/LastBellRound.sol";
import { PaymentRouter } from "../contracts/PaymentRouter.sol";
import { ScriptBase } from "./ScriptBase.sol";

/// @notice Devnet-only rollover that keeps the payment token, verifier, and
/// Stock Tokens while moving the previous round's 15% seed into a new round.
contract DeployNextLocal is ScriptBase {
    function run() external returns (LastBellRound nextRound) {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        LastBellRound previous = LastBellRound(vm.envAddress("CURRENT_ROUND_ADDRESS"));
        PaymentRouter paymentRouter = PaymentRouter(address(previous.paymentRouter()));

        vm.startBroadcast();
        nextRound = new LastBellRound(
            IERC20(address(previous.paymentToken())),
            paymentRouter,
            IMarketDataVerifier(address(previous.marketVerifier())),
            deployer,
            previous.treasury(),
            _settings(previous),
            _tickers(previous)
        );
        paymentRouter.setRoundAuthorization(address(nextRound), true);
        vm.stopBroadcast();
    }

    function _settings(LastBellRound previous)
        internal
        view
        returns (LastBellRound.RoundSettings memory)
    {
        return LastBellRound.RoundSettings({
            roundId: previous.roundId() + 1,
            claimPrice: previous.claimPrice(),
            startDuration: previous.startDuration(),
            extensionDuration: previous.extensionDuration(),
            rugDuration: previous.rugDuration(),
            hardCapDuration: previous.hardCapDuration(),
            maxReportAge: previous.maxReportAge(),
            marketThresholdBps: previous.marketThresholdBps(),
            greenMultiplierBps: previous.greenMultiplierBps(),
            flatMultiplierBps: previous.flatMultiplierBps(),
            redMultiplierBps: previous.redMultiplierBps(),
            marketMode: previous.marketMode(),
            producerPassRequired: previous.producerPassRequired()
        });
    }

    function _tickers(LastBellRound previous)
        internal
        view
        returns (LastBellRound.TickerConfig[4] memory tickers)
    {
        for (uint8 index; index < 4; index++) {
            (bytes32 symbol, address token, bytes32 marketId) =
                previous.tickerConfigs(index);
            tickers[index] = LastBellRound.TickerConfig(symbol, token, marketId);
        }
    }
}
