// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRound } from "../contracts/LastBellRound.sol";
import { IERC20 } from "../contracts/interfaces/IERC20.sol";
import { IMarketDataVerifier } from "../contracts/interfaces/IMarketDataVerifier.sol";
import { ScriptBase } from "./ScriptBase.sol";

contract DeployTestnet is ScriptBase {
    function run() external returns (LastBellRound round) {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        LastBellRound.RoundSettings memory settings = LastBellRound.RoundSettings({
            roundId: vm.envUint("ROUND_ID"),
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
            marketMode: vm.envBool("MARKET_VERIFIED")
                ? LastBellRound.MarketMode.Verified
                : LastBellRound.MarketMode.Flat,
            producerPassRequired: vm.envBool("PRODUCER_PASS_REQUIRED")
        });
        LastBellRound.TickerConfig[4] memory tickers;
        tickers[0] = _ticker(
            bytes32("NVDA"), "TICKER_0_TOKEN", "TICKER_0_FEED_ID"
        );
        tickers[1] = _ticker(
            bytes32("AAPL"), "TICKER_1_TOKEN", "TICKER_1_FEED_ID"
        );
        tickers[2] = _ticker(
            bytes32("TSLA"), "TICKER_2_TOKEN", "TICKER_2_FEED_ID"
        );
        tickers[3] = _ticker(
            bytes32("SPY"), "TICKER_3_TOKEN", "TICKER_3_FEED_ID"
        );

        vm.startBroadcast();
        round = new LastBellRound(
            IERC20(vm.envAddress("PAYMENT_TOKEN_ADDRESS")),
            IMarketDataVerifier(vm.envAddress("MARKET_VERIFIER_ADDRESS")),
            deployer,
            vm.envAddress("TREASURY_ADDRESS"),
            settings,
            tickers
        );
        vm.stopBroadcast();
    }

    function _ticker(
        bytes32 symbol,
        string memory tokenVariable,
        string memory feedVariable
    )
        internal
        returns (LastBellRound.TickerConfig memory)
    {
        return LastBellRound.TickerConfig(
            symbol,
            vm.envAddress(tokenVariable),
            vm.envBytes32(feedVariable)
        );
    }
}
