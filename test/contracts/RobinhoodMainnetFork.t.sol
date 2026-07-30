// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    ChainlinkMarketDataVerifier,
    IVerifierProxy
} from "../../contracts/ChainlinkMarketDataVerifier.sol";
import {
    ChainlinkEquityReportDecoder
} from "../../contracts/ChainlinkEquityReportDecoder.sol";
import { TestBase } from "./TestBase.sol";

contract RobinhoodMainnetForkTest is TestBase {
    address private constant ROBINHOOD_VERIFIER_PROXY =
        0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7;

    /// @dev Gated because the report must be freshly acquired with private
    /// Data Streams credentials. It never broadcasts to mainnet.
    function test_FreshOfficialEquityReport() public {
        if (!vm.envOr("RUN_ROBINHOOD_MAINNET_FORK", false)) return;

        vm.createSelectFork(vm.envString("ROBINHOOD_MAINNET_FORK_RPC_URL"));
        ChainlinkEquityReportDecoder decoder = new ChainlinkEquityReportDecoder();
        ChainlinkMarketDataVerifier verifier = new ChainlinkMarketDataVerifier(
            IVerifierProxy(ROBINHOOD_VERIFIER_PROXY), decoder, address(this)
        );
        verifier.setAuthorizedCaller(address(this), true);
        uint256 fee = vm.envOr("CHAINLINK_FORK_VERIFICATION_FEE_WEI", uint256(0));
        verifier.setVerificationFee(fee);
        vm.deal(address(verifier), fee);

        bytes memory signedReport = vm.envBytes("CHAINLINK_FORK_REPORT");
        (
            bytes32 feedId,
            uint256 price,,
            uint64 observedAt,
            uint64 expiresAt,
            bytes32 sourceHash
        ) = verifier.verify(signedReport);

        assertTrue(feedId != bytes32(0), "feed");
        assertTrue(price > 0, "price");
        assertTrue(observedAt <= block.timestamp, "future report");
        assertTrue(expiresAt >= block.timestamp, "expired report");
        assertEq(sourceHash, keccak256(signedReport), "source digest");
    }
}
