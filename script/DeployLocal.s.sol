// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRound } from "../contracts/LastBellRound.sol";
import { MockUSDG } from "../contracts/mocks/MockUSDG.sol";
import { ScriptBase } from "./ScriptBase.sol";

contract DeployLocal is ScriptBase {
    function run() external returns (MockUSDG token, LastBellRound round) {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        bytes32[4] memory symbols =
            [bytes32("NVDA"), bytes32("AAPL"), bytes32("TSLA"), bytes32("SPY")];

        vm.startBroadcast();
        token = new MockUSDG();
        round = new LastBellRound(
            token, deployer, deployer, 4663, 1e6, 45, 2, 10, 180, symbols
        );
        token.mint(deployer, 1_000_000e6);
        token.approve(address(round), 50e6);
        vm.stopBroadcast();
    }
}
