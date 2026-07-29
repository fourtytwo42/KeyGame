// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IMarketDataVerifier } from "../interfaces/IMarketDataVerifier.sol";

contract MockMarketDataVerifier is IMarketDataVerifier {
    function verify(bytes calldata report)
        external
        pure
        returns (
            bytes32 feedId,
            uint256 price,
            uint64 validFrom,
            uint64 observedAt,
            uint64 expiresAt
        )
    {
        return abi.decode(report, (bytes32, uint256, uint64, uint64, uint64));
    }
}
