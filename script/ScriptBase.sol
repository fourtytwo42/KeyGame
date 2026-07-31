// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ScriptVm {
    function envAddress(string calldata name) external returns (address);
    function envBool(string calldata name) external returns (bool);
    function envBytes32(string calldata name) external returns (bytes32);
    function envUint(string calldata name) external returns (uint256);
    function startBroadcast() external;
    function startBroadcast(address signer) external;
    function stopBroadcast() external;
}

abstract contract ScriptBase {
    ScriptVm internal constant vm =
        ScriptVm(address(uint160(uint256(keccak256("hevm cheat code")))));
}
