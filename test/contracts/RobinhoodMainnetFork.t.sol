// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    DexTwapMarketDataVerifier
} from "../../contracts/DexTwapMarketDataVerifier.sol";
import { IERC20 } from "../../contracts/interfaces/IERC20.sol";
import {
    RobinhoodStockSwapAdapter
} from "../../contracts/RobinhoodStockSwapAdapter.sol";
import { TestBase } from "./TestBase.sol";

contract RobinhoodMainnetForkTest is TestBase {
    address private constant FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address private constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address private constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address private constant NVDA_POOL = 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3;

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

    function test_ProductionAdapterExecutesSafePoolsAndRejectsUnsafeCatalogEntries()
        public
    {
        if (!vm.envOr("RUN_ROBINHOOD_MAINNET_FORK", false)) return;
        vm.createSelectFork(vm.envString("ROBINHOOD_MAINNET_FORK_RPC_URL"));
        RobinhoodStockSwapAdapter adapter =
            new RobinhoodStockSwapAdapter(FACTORY, USDG, address(this));
        address[5] memory stocks = [
            address(0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9),
            address(0x322F0929c4625eD5bAd873c95208D54E1c003b2d),
            address(0x12f190a9F9d7D37a250758b26824B97CE941bF54),
            address(0x117cc2133c37B721F49dE2A7a74833232B3B4C0C),
            NVDA
        ];
        address[5] memory pools = [
            address(0x783C9bbB765047CFdD2b84b92b2Ca9F11D34b7Ed),
            address(0xf4ACdAEEB7022862A763C9B1B885e11191c889E3),
            address(0x8AC92DA74AB5F3b1d024Dc1943Ad7e15Dc4179Ef),
            address(0xA43b424Bc609495AED4BCD88d654934b510B0aD9),
            NVDA_POOL
        ];
        bytes32[5] memory symbols = [
            bytes32("AAPL"),
            bytes32("TSLA"),
            bytes32("AMZN"),
            bytes32("SPY"),
            bytes32("NVDA")
        ];
        uint24[5] memory fees = [uint24(3_000), 3_000, 3_000, 3_000, 500];

        uint256 safeMarkets;
        for (uint8 i; i < stocks.length; i++) {
            adapter.configureMarket(
                symbols[i],
                keccak256(abi.encode("ROBINHOOD_CANONICAL", symbols[i])),
                stocks[i],
                pools[i],
                fees[i],
                1,
                10_000e6
            );
            uint256 quote;
            try adapter.quoteUsdgForStock(stocks[i], 1e6) returns (uint256 safeQuote) {
                quote = safeQuote;
                safeMarkets++;
            } catch (bytes memory reason) {
                assertEq(
                    keccak256(reason),
                    keccak256(
                        abi.encodeWithSelector(
                            RobinhoodStockSwapAdapter.UnsafeMarket.selector
                        )
                    ),
                    "unexpected catalog rejection"
                );
                continue;
            }
            assertTrue(quote > 0, "zero buy quote");
            vm.prank(pools[i]);
            bool funded = IERC20(USDG).transfer(address(this), 2e6);
            assertTrue(funded, "pool funding");
            IERC20(USDG).approve(address(adapter), 1e6);
            (, uint256 bought) = adapter.swapUsdgForStock(
                stocks[i],
                1e6,
                (quote * 99) / 100,
                uint64(block.timestamp + 30),
                address(this)
            );
            assertTrue(bought > 0, "zero buy");
            IERC20(stocks[i]).approve(address(adapter), bought);
            (, uint256 sold) = adapter.swapStockForUsdg(
                stocks[i], bought, 980_000, uint64(block.timestamp + 30), address(this)
            );
            assertTrue(sold >= 980_000, "round trip outside guard");
        }
        assertEq(adapter.marketCount(), 5, "catalog size");
        assertTrue(safeMarkets >= 4, "fewer than four safe roster markets");
    }
}
