// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRoundV4 } from "../contracts/LastBellRoundV4.sol";
import { RewardRouterV4 } from "../contracts/RewardRouterV4.sol";
import { RoundManagerV4 } from "../contracts/RoundManagerV4.sol";
import { MockStockSwapAdapter } from "../contracts/mocks/MockStockSwapAdapter.sol";
import { MockStockToken } from "../contracts/mocks/MockStockToken.sol";
import { MockUSDG } from "../contracts/mocks/MockUSDG.sol";
import { ScriptBase } from "./ScriptBase.sol";

/// @dev Testnet-only mock deployment. The shell wrapper performs source,
/// chain, balance, explicit-broadcast, and protected-build checks first.
contract DeployTestnetV4 is ScriptBase {
    function run()
        external
        returns (
            MockUSDG usdg,
            MockStockSwapAdapter adapter,
            RoundManagerV4 manager,
            RewardRouterV4 rewardRouter,
            LastBellRoundV4 round
        )
    {
        require(block.chainid == 46_630, "WRONG_CHAIN");
        require(vm.envBool("KEYGAME_TESTNET_V4_BROADCAST"), "BROADCAST_LOCKED");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");

        vm.startBroadcast(deployer);
        usdg = new MockUSDG();
        adapter = new MockStockSwapAdapter(usdg);
        MockStockToken[4] memory stocks = [
            new MockStockToken("NVDA"),
            new MockStockToken("AAPL"),
            new MockStockToken("TSLA"),
            new MockStockToken("SPY")
        ];
        for (uint8 i; i < 4; i++) {
            adapter.setRate(address(stocks[i]), 1e18);
        }
        manager = new RoundManagerV4(usdg, adapter, deployer, deployer, deployer);
        rewardRouter = new RewardRouterV4(manager.lifetimeVault());
        LastBellRoundV4.RoundSettings memory settings = LastBellRoundV4.RoundSettings({
            roundId: vm.envUint("INITIAL_ROUND_ID"),
            startDuration: 300,
            extensionDuration: 300,
            rugDuration: 10,
            hardCapDuration: 600,
            heatTarget: 4_000e6,
            producerPassRequired: false
        });
        bytes32[4] memory symbols =
            [bytes32("NVDA"), bytes32("AAPL"), bytes32("TSLA"), bytes32("SPY")];
        LastBellRoundV4.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: symbols[i],
                assetId: keccak256(abi.encode("TESTNET_MOCK", symbols[i])),
                token: address(stocks[i])
            });
        }
        round = manager.prepareRound(settings, tickers);
        uint256[4] memory zeroes;
        manager.activatePrepared(zeroes, zeroes, type(uint64).max);
        vm.stopBroadcast();
    }
}
