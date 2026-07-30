// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    DexTwapMarketDataVerifier
} from "../../contracts/DexTwapMarketDataVerifier.sol";
import { TestBase } from "./TestBase.sol";

contract RobinhoodMainnetForkTest is TestBase {
    address private constant FACTORY =
        0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address private constant USDG =
        0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address private constant NVDA =
        0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address private constant NVDA_POOL =
        0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3;

    function test_ReadsLiveTenMinuteNvdaUsdgTwap() public {
        if (!vm.envOr("RUN_ROBINHOOD_MAINNET_FORK", false)) return;
        vm.createSelectFork(vm.envString("ROBINHOOD_MAINNET_FORK_RPC_URL"));

        DexTwapMarketDataVerifier verifier =
            new DexTwapMarketDataVerifier(FACTORY, USDG, address(this));
        bytes32 marketId = verifier.configureMarket(NVDA_POOL, NVDA, 500, 1);
        verifier.setAuthorizer(address(this));
        verifier.authorizeCaller(address(this));
        (
            bytes32 verifiedMarketId,
            uint256 price,
            uint64 validFrom,
            uint64 observedAt,
            uint64 expiresAt,
            bytes32 sourceHash,
            address sourcePool,
            uint256 sourceChainId,
            uint64 sourceBlockNumber,
            bytes32 sourceBlockHash
        ) = verifier.verify(marketId, "");

        assertEq(verifiedMarketId, marketId, "market");
        assertTrue(price > 100e18 && price < 1_000e18, "plausible NVDA price");
        assertEq(observedAt - validFrom, 600, "ten minute window");
        assertEq(expiresAt, observedAt, "onchain observation");
        assertTrue(sourceHash != bytes32(0), "source digest");
        assertEq(sourcePool, NVDA_POOL, "source pool");
        assertEq(sourceChainId, 4663, "source chain");
        assertTrue(sourceBlockNumber > 0, "source block");
        assertTrue(sourceBlockHash != bytes32(0), "source block hash");
    }
}
