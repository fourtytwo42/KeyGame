// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {
    DexTwapMarketDataVerifier
} from "../../contracts/DexTwapMarketDataVerifier.sol";
import { MockStockToken } from "../../contracts/mocks/MockStockToken.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { TestBase } from "./TestBase.sol";

contract MockV3Factory {
    mapping(bytes32 => address) internal pools;

    function setPool(address tokenA, address tokenB, uint24 fee, address pool)
        external
    {
        pools[keccak256(abi.encode(tokenA, tokenB, fee))] = pool;
        pools[keccak256(abi.encode(tokenB, tokenA, fee))] = pool;
    }

    function getPool(address tokenA, address tokenB, uint24 fee)
        external
        view
        returns (address)
    {
        return pools[keccak256(abi.encode(tokenA, tokenB, fee))];
    }
}

contract MockV3Pool {
    address public token0;
    address public token1;
    uint24 public fee;
    uint128 public liquidity;
    int24 public spotTick;
    int24 public meanTick;
    bool public historyAvailable = true;

    constructor(address token0_, address token1_, uint24 fee_) {
        token0 = token0_;
        token1 = token1_;
        fee = fee_;
        liquidity = 1_000_000;
    }

    function setState(int24 spot, int24 mean, uint128 liquidity_) external {
        spotTick = spot;
        meanTick = mean;
        liquidity = liquidity_;
    }

    function setHistory(bool available) external {
        historyAvailable = available;
    }

    function slot0()
        external
        view
        returns (uint160, int24, uint16, uint16, uint16, uint8, bool)
    {
        return (1, spotTick, 0, 10, 10, 0, true);
    }

    function observe(uint32[] calldata)
        external
        view
        returns (int56[] memory ticks, uint160[] memory secondsPerLiquidity)
    {
        require(historyAvailable, "OLD");
        ticks = new int56[](3);
        secondsPerLiquidity = new uint160[](3);
        ticks[2] = int56(meanTick) * 600;
    }
}

contract DexTwapMarketDataVerifierTest is TestBase {
    MockUSDG internal usdg;
    MockStockToken internal stock;
    MockV3Factory internal factory;
    MockV3Pool internal pool;
    DexTwapMarketDataVerifier internal verifier;
    bytes32 internal marketId;

    function setUp() public {
        vm.warp(2_000);
        vm.roll(100);
        usdg = new MockUSDG();
        stock = new MockStockToken("DEX");
        factory = new MockV3Factory();
        address token0 = address(stock) < address(usdg) ? address(stock) : address(usdg);
        address token1 = address(stock) < address(usdg) ? address(usdg) : address(stock);
        pool = new MockV3Pool(token0, token1, 3000);
        factory.setPool(address(stock), address(usdg), 3000, address(pool));
        verifier = new DexTwapMarketDataVerifier(
            address(factory), address(usdg), address(this)
        );
        marketId = verifier.configureMarket(address(pool), address(stock), 3000, 1);
        verifier.setAuthorizer(address(this));
        verifier.authorizeCaller(address(this));
    }

    function test_ProvidesTenMinuteObservationAndStableDigest() public view {
        (
            bytes32 actual,
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
        assertEq(actual, marketId, "market");
        assertTrue(price > 0, "price");
        assertEq(observedAt - validFrom, 600, "window");
        assertEq(expiresAt, observedAt, "direct read");
        assertTrue(sourceHash != bytes32(0), "source");
        assertEq(sourcePool, address(pool), "pool");
        assertEq(sourceChainId, block.chainid, "chain");
        assertTrue(sourceBlockNumber > 0, "block");
        assertEq(sourceBlockHash, blockhash(block.number - 1), "block hash");
    }

    function test_RejectsZeroLiquidityAndExcessiveDeviation() public {
        pool.setState(0, 0, 0);
        vm.expectRevert(DexTwapMarketDataVerifier.UnsafeMarket.selector);
        verifier.verify(marketId, "");

        pool.setState(101, 0, 1_000_000);
        vm.expectRevert(DexTwapMarketDataVerifier.UnsafeMarket.selector);
        verifier.verify(marketId, "");
    }

    function test_RejectsMissingObservationHistory() public {
        pool.setHistory(false);
        vm.expectRevert();
        verifier.verify(marketId, "");
    }
}
