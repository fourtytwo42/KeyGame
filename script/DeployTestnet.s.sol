// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { RoundManager } from "../contracts/RoundManager.sol";
import {
    TestnetAttestedMarketDataVerifier
} from "../contracts/TestnetAttestedMarketDataVerifier.sol";
import { TestnetMockUSDG } from "../contracts/mocks/TestnetMockUSDG.sol";
import { ScriptBase } from "./ScriptBase.sol";

contract DeployTestnet is ScriptBase {
    event TestnetDeployment(
        address indexed paymentToken,
        address indexed verifier,
        address indexed manager,
        address paymentRouter
    );

    error WrongChain();
    error InvalidSeed();

    uint256 internal constant PAYMENT_TOKEN_SCALE = 1e6;
    uint256 internal constant MAX_INITIAL_SEED_USD = 1_000_000;

    function initialSeedRaw(uint256 initialSeedUsd) public pure returns (uint256) {
        if (initialSeedUsd > MAX_INITIAL_SEED_USD) revert InvalidSeed();
        return initialSeedUsd * PAYMENT_TOKEN_SCALE;
    }

    function run()
        external
        returns (
            TestnetMockUSDG token,
            TestnetAttestedMarketDataVerifier verifier,
            RoundManager manager
        )
    {
        if (block.chainid != 46630) {
            revert WrongChain();
        }
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address keeper = vm.envAddress("KEEPER_ADDRESS");
        address attestor = vm.envAddress("ATTESTOR_ADDRESS");
        address faucet = vm.envAddress("FAUCET_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        uint256 initialSeed = initialSeedRaw(vm.envUint("INITIAL_SEED_USD"));

        vm.startBroadcast();
        token = new TestnetMockUSDG(deployer);
        verifier = new TestnetAttestedMarketDataVerifier(attestor, deployer);
        manager = new RoundManager(token, verifier, admin, keeper, treasury);
        verifier.setAuthorizer(address(manager));
        verifier.transferAdmin(admin);
        if (initialSeed != 0) token.mint(address(manager), initialSeed);
        token.transferOwnership(faucet);
        vm.stopBroadcast();

        emit TestnetDeployment(
            address(token),
            address(verifier),
            address(manager),
            address(manager.paymentRouter())
        );
    }
}
