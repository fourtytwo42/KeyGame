// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IMarketDataVerifier {
    function authorizeCaller(address caller) external;

    function verify(bytes calldata report)
        external
        returns (
            bytes32 feedId,
            uint256 price,
            uint64 validFrom,
            uint64 observedAt,
            uint64 expiresAt,
            bytes32 sourceReportHash
        );
}
