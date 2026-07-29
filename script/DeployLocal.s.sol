// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRound } from "../contracts/LastBellRound.sol";
import { PaymentRouter } from "../contracts/PaymentRouter.sol";
import { MockMarketDataVerifier } from "../contracts/mocks/MockMarketDataVerifier.sol";
import { MockStockToken } from "../contracts/mocks/MockStockToken.sol";
import { MockUSDG } from "../contracts/mocks/MockUSDG.sol";
import { ScriptBase } from "./ScriptBase.sol";

contract DeployLocal is ScriptBase {
    function run()
        external
        returns (
            MockUSDG token,
            PaymentRouter paymentRouter,
            MockMarketDataVerifier verifier,
            MockStockToken nvda,
            MockStockToken aapl,
            MockStockToken tsla,
            MockStockToken spy,
            LastBellRound round
        )
    {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");

        vm.startBroadcast();
        token = new MockUSDG();
        paymentRouter = new PaymentRouter(token, deployer);
        verifier = new MockMarketDataVerifier();
        nvda = new MockStockToken("NVDA");
        aapl = new MockStockToken("AAPL");
        tsla = new MockStockToken("TSLA");
        spy = new MockStockToken("SPY");

        LastBellRound.RoundSettings memory settings = LastBellRound.RoundSettings({
            roundId: 4663,
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
            marketMode: LastBellRound.MarketMode.Verified,
            producerPassRequired: false
        });
        LastBellRound.TickerConfig[4] memory tickers = [
            LastBellRound.TickerConfig(
                bytes32("NVDA"), address(nvda), keccak256("NVDA/USD")
            ),
            LastBellRound.TickerConfig(
                bytes32("AAPL"), address(aapl), keccak256("AAPL/USD")
            ),
            LastBellRound.TickerConfig(
                bytes32("TSLA"), address(tsla), keccak256("TSLA/USD")
            ),
            LastBellRound.TickerConfig(
                bytes32("SPY"), address(spy), keccak256("SPY/USD")
            )
        ];
        round =
            new LastBellRound(
                token,
                paymentRouter,
                verifier,
                deployer,
                deployer,
                settings,
                tickers
            );
        paymentRouter.setRoundAuthorization(address(round), true);
        token.mint(deployer, 1_000_000e6);
        token.approve(address(paymentRouter), 50e6);
        vm.stopBroadcast();
    }
}
