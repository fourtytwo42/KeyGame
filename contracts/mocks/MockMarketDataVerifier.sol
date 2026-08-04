// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IMarketDataVerifier } from "../interfaces/IMarketDataVerifier.sol";

contract MockMarketDataVerifier is IMarketDataVerifier {
    function authorizeCaller(address) external pure { }

    function verify(bytes32 expectedMarketId, bytes calldata report)
        external
        view
        returns (
            bytes32 marketId,
            uint256 price,
            uint64 validFrom,
            uint64 observedAt,
            uint64 expiresAt,
            bytes32 sourceReportHash,
            address sourcePool,
            uint256 sourceChainId,
            uint64 sourceBlockNumber,
            bytes32 sourceBlockHash
        )
    {
        (marketId, price, validFrom, observedAt, expiresAt) =
            abi.decode(report, (bytes32, uint256, uint64, uint64, uint64));
        require(marketId == expectedMarketId, "MARKET_ID");
        sourceReportHash = keccak256(report);
        sourcePool = address(0);
        sourceChainId = block.chainid;
        sourceBlockNumber = uint64(block.number);
        sourceBlockHash = bytes32(0);
    }
}
