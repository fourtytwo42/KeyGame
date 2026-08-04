// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { DeployTestnet } from "../../script/DeployTestnet.s.sol";
import { TestBase } from "./TestBase.sol";

contract DeployTestnetConfigTest is TestBase {
    DeployTestnet internal deployment = new DeployTestnet();

    function test_ConvertsHumanUsdToSixDecimalRawUnits() public view {
        assertEq(deployment.initialSeedRaw(50), 50_000_000, "seed raw units");
    }

    function test_RejectsImplausiblyLargeSeed() public {
        vm.expectRevert(DeployTestnet.InvalidSeed.selector);
        deployment.initialSeedRaw(1_000_001);
    }
}
