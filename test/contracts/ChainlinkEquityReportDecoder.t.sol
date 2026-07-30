// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    ChainlinkEquityReportDecoder
} from "../../contracts/ChainlinkEquityReportDecoder.sol";
import { TestBase } from "./TestBase.sol";

contract ChainlinkEquityReportDecoderTest is TestBase {
    ChainlinkEquityReportDecoder private decoder;

    function setUp() public {
        decoder = new ChainlinkEquityReportDecoder();
    }

    function testDecodesV8MidPrice() public view {
        bytes32 feedId = bytes32(uint256(8) << 240 | 123);
        bytes memory report = abi.encode(
            feedId,
            uint32(100),
            uint32(101),
            uint192(2),
            uint192(3),
            uint32(104),
            uint64(101),
            int192(250e18),
            uint32(2)
        );

        (
            bytes32 actualFeed,
            uint256 price,
            uint64 validFrom,
            uint64 observedAt,
            uint64 expiresAt
        ) = decoder.decode(report);

        assertEq(actualFeed, feedId, "feed");
        assertEq(price, 250e8, "price");
        assertEq(validFrom, 100, "valid from");
        assertEq(observedAt, 101, "observed");
        assertEq(expiresAt, 104, "expires");
    }

    function testDecodesV10TokenizedPrice() public view {
        bytes32 feedId = bytes32(uint256(10) << 240 | 456);
        bytes memory report = abi.encode(
            feedId,
            uint32(200),
            uint32(201),
            uint192(2),
            uint192(3),
            uint32(204),
            uint64(201),
            int192(100e18),
            uint32(1),
            int192(2e18),
            int192(0),
            uint32(0),
            int192(50e18)
        );

        (, uint256 price,,,) = decoder.decode(report);
        assertEq(price, 50e8, "tokenized price");
    }

    function testRejectsUnsupportedSchema() public {
        bytes32 feedId = bytes32(uint256(3) << 240 | 789);
        vm.expectRevert(
            abi.encodeWithSelector(
                ChainlinkEquityReportDecoder.UnsupportedReportVersion.selector,
                uint16(3)
            )
        );
        decoder.decode(abi.encode(feedId, uint256(1)));
    }
}
