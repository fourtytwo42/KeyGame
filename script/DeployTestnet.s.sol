// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRound } from "../contracts/LastBellRound.sol";
import { IERC20 } from "../contracts/interfaces/IERC20.sol";
import { ScriptBase } from "./ScriptBase.sol";

contract DeployTestnet is ScriptBase {
    function run() external returns (LastBellRound round) {
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address paymentToken = vm.envAddress("PAYMENT_TOKEN_ADDRESS");
        uint256 configuredRoundId = vm.envUint("ROUND_ID");
        bytes32[4] memory symbols =
            [bytes32("NVDA"), bytes32("AAPL"), bytes32("TSLA"), bytes32("SPY")];

        vm.startBroadcast();
        round = new LastBellRound(
            IERC20(paymentToken),
            deployer,
            treasury,
            configuredRoundId,
            1e6,
            45,
            2,
            10,
            180,
            symbols
        );
        vm.stopBroadcast();
    }
}
