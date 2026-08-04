// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface Vm {
    function chainId(uint256 newChainId) external;
    function warp(uint256 newTimestamp) external;
    function roll(uint256 newHeight) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
    function expectRevert() external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function addr(uint256 privateKey) external returns (address);
    function envOr(string calldata name, bool defaultValue) external returns (bool);
    function envOr(string calldata name, uint256 defaultValue)
        external
        returns (uint256);
    function envString(string calldata name) external returns (string memory);
    function envBytes(string calldata name) external returns (bytes memory);
    function createSelectFork(string calldata urlOrAlias) external returns (uint256);
    function deal(address account, uint256 newBalance) external;
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

    function assertEq(bytes32 actual, bytes32 expected, string memory reason)
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
