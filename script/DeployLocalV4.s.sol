// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRoundV4 } from "../contracts/LastBellRoundV4.sol";
import { LifetimePointsVault } from "../contracts/LifetimePointsVault.sol";
import { RewardRouterV4 } from "../contracts/RewardRouterV4.sol";
import { RoundManagerV4 } from "../contracts/RoundManagerV4.sol";
import { MockStockSwapAdapter } from "../contracts/mocks/MockStockSwapAdapter.sol";
import { MockStockToken } from "../contracts/mocks/MockStockToken.sol";
import { MockUSDG } from "../contracts/mocks/MockUSDG.sol";
import { ScriptBase } from "./ScriptBase.sol";

contract DeployLocalV4 is ScriptBase {
    function run()
        external
        returns (
            MockUSDG usdg,
            MockStockSwapAdapter swapAdapter,
            MockStockToken nvda,
            MockStockToken aapl,
            MockStockToken tsla,
            MockStockToken spy,
            RoundManagerV4 manager,
            RewardRouterV4 rewardRouter,
            LastBellRoundV4 round
        )
    {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        vm.startBroadcast();
        usdg = new MockUSDG();
        swapAdapter = new MockStockSwapAdapter(usdg);
        nvda = new MockStockToken("NVDA");
        aapl = new MockStockToken("AAPL");
        tsla = new MockStockToken("TSLA");
        spy = new MockStockToken("SPY");
        MockStockToken[4] memory stocks = [nvda, aapl, tsla, spy];
        for (uint8 i; i < 4; i++) {
            swapAdapter.setRate(address(stocks[i]), 1e18);
        }

        manager =
            new RoundManagerV4(usdg, swapAdapter, deployer, deployer, deployer);
        rewardRouter = new RewardRouterV4(manager.lifetimeVault());

        LastBellRoundV4.RoundSettings memory settings =
            LastBellRoundV4.RoundSettings({
                roundId: 4663,
                startDuration: 45,
                extensionDuration: 2,
                rugDuration: 10,
                hardCapDuration: 180,
                heatTarget: 4_000e6,
                producerPassRequired: false
            });
        bytes32[4] memory symbols =
            [bytes32("NVDA"), bytes32("AAPL"), bytes32("TSLA"), bytes32("SPY")];
        LastBellRoundV4.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: symbols[i],
                assetId: keccak256(abi.encode(symbols[i])),
                token: address(stocks[i])
            });
        }
        round = manager.prepareRound(settings, tickers);
        uint256[4] memory zeroes;
        manager.activatePrepared(zeroes, zeroes, type(uint64).max);
        usdg.mint(deployer, 10_000_000e6);
        vm.stopBroadcast();
    }
}
