// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IMarketDataVerifier {
    function authorizeCaller(address caller) external;

    function verify(bytes32 marketId, bytes calldata proof)
        external
        returns (
            bytes32 verifiedMarketId,
            uint256 price,
            uint64 validFrom,
            uint64 observedAt,
            uint64 expiresAt,
            bytes32 sourceReportHash,
            address sourcePool,
            uint256 sourceChainId,
            uint64 sourceBlockNumber,
            bytes32 sourceBlockHash
        );
}
