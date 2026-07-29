// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface Vm {
    function warp(uint256 newTimestamp) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
}

abstract contract TestBase {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 actual, uint256 expected, string memory reason)
        internal
        pure
    {
        require(actual == expected, reason);
    }

    function assertEq(address actual, address expected, string memory reason)
        internal
        pure
    {
        require(actual == expected, reason);
    }

    function assertTrue(bool value, string memory reason) internal pure {
        require(value, reason);
    }

    function bound(uint256 value, uint256 min, uint256 max)
        internal
        pure
        returns (uint256)
    {
        require(min <= max, "INVALID_BOUND");
        return min + (value % (max - min + 1));
    }
}
