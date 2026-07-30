// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Deliberate compile-time mainnet broadcast lock.
contract DeployMainnet {
    error AuditAndLegalReleaseRequired();

    function run() external pure {
        revert AuditAndLegalReleaseRequired();
    }
}
