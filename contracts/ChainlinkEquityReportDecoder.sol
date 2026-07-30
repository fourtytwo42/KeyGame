// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IChainlinkReportDecoder {
    function decode(bytes calldata verifiedReport)
        external
        pure
        returns (
            bytes32 feedId,
            uint256 price,
            uint64 validFrom,
            uint64 observedAt,
            uint64 expiresAt
        );
}

/// @notice Normalizes the Chainlink equity report schemas used by KeyGame.
/// @dev V8 is the non-OTC equity schema. V10 is the tokenized-equity schema;
/// its 24/7 tokenized price is used because it already includes the current
/// corporate-action multiplier.
contract ChainlinkEquityReportDecoder is IChainlinkReportDecoder {
    uint16 private constant VERSION_8 = 8;
    uint16 private constant VERSION_10 = 10;
    uint256 private constant PRICE_SCALE_DOWN = 1e10;

    struct ReportV8 {
        bytes32 feedId;
        uint32 validFromTimestamp;
        uint32 observationsTimestamp;
        uint192 nativeFee;
        uint192 linkFee;
        uint32 expiresAt;
        uint64 lastUpdateTimestamp;
        int192 midPrice;
        uint32 marketStatus;
    }

    struct ReportV10 {
        bytes32 feedId;
        uint32 validFromTimestamp;
        uint32 observationsTimestamp;
        uint192 nativeFee;
        uint192 linkFee;
        uint32 expiresAt;
        uint64 lastUpdateTimestamp;
        int192 price;
        uint32 marketStatus;
        int192 currentMultiplier;
        int192 newMultiplier;
        uint32 activationDateTime;
        int192 tokenizedPrice;
    }

    error InvalidReport();
    error UnsupportedReportVersion(uint16 version);

    function decode(bytes calldata encoded)
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
        if (encoded.length < 32) revert InvalidReport();
        bytes32 encodedFeedId;
        assembly ("memory-safe") {
            encodedFeedId := calldataload(encoded.offset)
        }
        uint16 version = uint16(bytes2(encodedFeedId));

        if (version == VERSION_8) {
            ReportV8 memory report = abi.decode(encoded, (ReportV8));
            if (
                report.feedId != encodedFeedId || report.midPrice <= 0
                    || report.lastUpdateTimestamp == 0
            ) revert InvalidReport();
            return (
                report.feedId,
                uint256(uint192(report.midPrice)) / PRICE_SCALE_DOWN,
                report.validFromTimestamp,
                report.observationsTimestamp,
                report.expiresAt
            );
        }

        if (version == VERSION_10) {
            ReportV10 memory report = abi.decode(encoded, (ReportV10));
            if (
                report.feedId != encodedFeedId || report.tokenizedPrice <= 0
                    || report.currentMultiplier <= 0 || report.lastUpdateTimestamp == 0
            ) revert InvalidReport();
            return (
                report.feedId,
                uint256(uint192(report.tokenizedPrice)) / PRICE_SCALE_DOWN,
                report.validFromTimestamp,
                report.observationsTimestamp,
                report.expiresAt
            );
        }

        revert UnsupportedReportVersion(version);
    }
}
