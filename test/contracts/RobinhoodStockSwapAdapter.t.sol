// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { TestBase } from "./TestBase.sol";
import { IERC20 } from "../../contracts/interfaces/IERC20.sol";
import {
    RobinhoodStockSwapAdapter
} from "../../contracts/RobinhoodStockSwapAdapter.sol";
import { MockUSDG } from "../../contracts/mocks/MockUSDG.sol";
import { MockStockToken } from "../../contracts/mocks/MockStockToken.sol";

interface IAdapterCallback {
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata data
    ) external;
}

contract MockV3FactoryV4 {
    mapping(bytes32 => address) private pools;

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

contract MockV3PoolV4 {
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee = 3_000;
    uint128 public liquidity = 1_000_000;
    int24 public twapTick;
    int24 public spotTick;
    uint16 public outputBps = 10_000;
    bool public historyAvailable = true;
    address public immutable usdg;

    constructor(address stock, address usdg_, int24 tick) {
        token0 = stock < usdg_ ? stock : usdg_;
        token1 = stock < usdg_ ? usdg_ : stock;
        usdg = usdg_;
        twapTick = tick;
        spotTick = tick;
    }

    function setSafety(
        uint128 nextLiquidity,
        int24 nextSpotTick,
        uint16 nextOutputBps,
        bool nextHistoryAvailable
    ) external {
        liquidity = nextLiquidity;
        spotTick = nextSpotTick;
        outputBps = nextOutputBps;
        historyAvailable = nextHistoryAvailable;
    }

    function slot0()
        external
        view
        returns (uint160, int24, uint16, uint16, uint16, uint8, bool)
    {
        return (0, spotTick, 0, 3, 3, 0, true);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory cumulatives, uint160[] memory secondsPerLiquidity)
    {
        require(historyAvailable, "HISTORY");
        cumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidity = new uint160[](secondsAgos.length);
        for (uint256 i; i < secondsAgos.length; i++) {
            cumulatives[i] = int56(twapTick) * int56(uint56(1_800 - secondsAgos[i]));
        }
    }

    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1) {
        require(amountSpecified > 0, "EXACT_INPUT");
        uint256 amountIn = uint256(amountSpecified);
        address tokenIn = zeroForOne ? token0 : token1;
        address tokenOut = zeroForOne ? token1 : token0;
        uint256 amountOut = tokenIn == usdg
            ? (amountIn * 1e12 * outputBps) / 10_000
            : (amountIn * outputBps) / 1e12 / 10_000;
        if (zeroForOne) {
            amount0 = int256(amountIn);
            amount1 = -int256(amountOut);
        } else {
            amount0 = -int256(amountOut);
            amount1 = int256(amountIn);
        }
        IAdapterCallback(msg.sender).uniswapV3SwapCallback(amount0, amount1, data);
        require(IERC20(tokenOut).transfer(recipient, amountOut), "OUT");
    }
}

contract MockConfigurationGuardV4 {
    bool public marketConfigurationAllowed = true;

    function setAllowed(bool allowed) external {
        marketConfigurationAllowed = allowed;
    }
}

contract RobinhoodStockSwapAdapterTest is TestBase {
    MockUSDG internal usdg;
    MockStockToken internal stock;
    MockV3FactoryV4 internal factory;
    MockV3PoolV4 internal pool;
    RobinhoodStockSwapAdapter internal adapter;
    MockConfigurationGuardV4 internal guard;

    function setUp() public {
        vm.chainId(4663);
        vm.warp(1_000_000);
        usdg = new MockUSDG();
        stock = new MockStockToken("TEST");
        factory = new MockV3FactoryV4();
        int24 tick = address(stock) < address(usdg) ? int24(-276_324) : int24(276_324);
        pool = new MockV3PoolV4(address(stock), address(usdg), tick);
        factory.setPool(address(stock), address(usdg), 3_000, address(pool));
        usdg.mint(address(pool), 50_000e6);
        stock.mint(address(pool), 50_000e18);
        adapter = new RobinhoodStockSwapAdapter(
            address(factory), address(usdg), address(this)
        );
        adapter.configureMarket(
            bytes32("TEST"),
            keccak256("TEST"),
            address(stock),
            address(pool),
            3_000,
            1,
            10_000e6
        );
        guard = new MockConfigurationGuardV4();
        adapter.setConfigurationGuard(address(guard));
    }

    function test_DirectBuyAndSellUseExactBalanceDeltas() public {
        usdg.mint(address(this), 100e6);
        usdg.approve(address(adapter), type(uint256).max);
        uint256 quote = adapter.quoteUsdgForStock(address(stock), 100e6);
        assertTrue(quote > 99e18 && quote < 101e18, "unexpected quote");
        uint256 bought = adapter.swapUsdgForStock(
            address(stock), 100e6, 99e18, uint64(block.timestamp + 30), address(this)
        );
        assertEq(bought, 100e18, "buy output");
        stock.approve(address(adapter), type(uint256).max);
        uint256 sold = adapter.swapStockForUsdg(
            address(stock), 100e18, 99e6, uint64(block.timestamp + 30), address(this)
        );
        assertEq(sold, 100e6, "sell output");
    }

    function test_UnsafeOrExpiredExecutionIsAtomic() public {
        usdg.mint(address(this), 100e6);
        usdg.approve(address(adapter), type(uint256).max);
        uint256 beforeBalance = usdg.balanceOf(address(this));

        pool.setSafety(1_000_000, pool.spotTick() + 250, 10_000, true);
        vm.expectRevert(RobinhoodStockSwapAdapter.UnsafeMarket.selector);
        adapter.swapUsdgForStock(
            address(stock), 10e6, 1, uint64(block.timestamp + 30), address(this)
        );
        assertEq(usdg.balanceOf(address(this)), beforeBalance, "unsafe charged");

        pool.setSafety(1_000_000, pool.twapTick(), 10_000, true);
        vm.expectRevert(RobinhoodStockSwapAdapter.Expired.selector);
        adapter.swapUsdgForStock(
            address(stock), 10e6, 1, uint64(block.timestamp - 1), address(this)
        );
        assertEq(usdg.balanceOf(address(this)), beforeBalance, "expired charged");
    }

    function test_OutputBeyondOnePercentDeviationReverts() public {
        usdg.mint(address(this), 100e6);
        usdg.approve(address(adapter), type(uint256).max);
        pool.setSafety(1_000_000, pool.twapTick(), 9_800, true);
        vm.expectRevert(RobinhoodStockSwapAdapter.UnsafeMarket.selector);
        adapter.swapUsdgForStock(
            address(stock), 100e6, 1, uint64(block.timestamp + 30), address(this)
        );
        assertEq(usdg.balanceOf(address(this)), 100e6, "deviation charged");
    }

    function test_ExactOnePercentExecutionBoundaryIsAccepted() public {
        usdg.mint(address(this), 100e6);
        usdg.approve(address(adapter), type(uint256).max);
        pool.setSafety(1_000_000, pool.twapTick(), 9_900, true);
        uint256 bought = adapter.swapUsdgForStock(
            address(stock), 100e6, 99e18, uint64(block.timestamp + 30), address(this)
        );
        assertEq(bought, 99e18, "one-percent boundary");
    }

    function test_ConfigurationIsSafeControlledAndWindowLocked() public {
        guard.setAllowed(false);
        vm.expectRevert(RobinhoodStockSwapAdapter.Unauthorized.selector);
        adapter.disableMarket(address(stock));
        guard.setAllowed(true);
        adapter.disableMarket(address(stock));
        vm.expectRevert(RobinhoodStockSwapAdapter.InvalidMarket.selector);
        adapter.quoteUsdgForStock(address(stock), 1e6);

        vm.prank(address(0xBEEF));
        vm.expectRevert(RobinhoodStockSwapAdapter.Unauthorized.selector);
        adapter.proposeAdmin(address(0xBEEF));
    }

    function test_AdminTransferRequiresAcceptanceAndCanBeCancelled() public {
        address nextAdmin = address(0xBEEF);
        adapter.proposeAdmin(nextAdmin);
        assertEq(adapter.admin(), address(this), "admin changes too early");
        assertEq(adapter.pendingAdmin(), nextAdmin, "pending admin");

        vm.prank(address(0xCAFE));
        vm.expectRevert(RobinhoodStockSwapAdapter.Unauthorized.selector);
        adapter.acceptAdmin();

        adapter.cancelAdminTransfer();
        assertEq(adapter.pendingAdmin(), address(0), "cancelled pending admin");
        vm.prank(nextAdmin);
        vm.expectRevert(RobinhoodStockSwapAdapter.Unauthorized.selector);
        adapter.acceptAdmin();

        adapter.proposeAdmin(nextAdmin);
        vm.prank(nextAdmin);
        adapter.acceptAdmin();
        assertEq(adapter.admin(), nextAdmin, "accepted admin");
        assertEq(adapter.pendingAdmin(), address(0), "pending cleared");

        vm.expectRevert(RobinhoodStockSwapAdapter.Unauthorized.selector);
        adapter.disableMarket(address(stock));
    }

    function test_DisabledMarketBlocksBuysButKeepsSeedExitRecoverable() public {
        adapter.disableMarket(address(stock));
        vm.expectRevert(RobinhoodStockSwapAdapter.InvalidMarket.selector);
        adapter.quoteUsdgForStock(address(stock), 10e6);

        stock.mint(address(this), 10e18);
        stock.approve(address(adapter), type(uint256).max);
        uint256 quote = adapter.quoteStockForUsdg(address(stock), 10e18);
        assertTrue(quote > 9_900_000, "disabled sell quote");
        uint256 sold = adapter.swapStockForUsdg(
            address(stock),
            10e18,
            9_900_000,
            uint64(block.timestamp + 30),
            address(this)
        );
        assertEq(sold, 10e6, "disabled seed exit");
    }

    function test_MissingHistoryAndLowDepthAreRejected() public {
        pool.setSafety(1_000_000, pool.twapTick(), 10_000, false);
        vm.expectRevert();
        adapter.quoteUsdgForStock(address(stock), 1e6);

        pool.setSafety(1_000_000, pool.twapTick(), 10_000, true);
        vm.prank(address(pool));
        usdg.transfer(address(0xCAFE), 41_000e6);
        vm.expectRevert(RobinhoodStockSwapAdapter.UnsafeMarket.selector);
        adapter.quoteUsdgForStock(address(stock), 1e6);
    }

    function test_CallbackCannotBeSpoofed() public {
        vm.expectRevert(RobinhoodStockSwapAdapter.Unauthorized.selector);
        adapter.uniswapV3SwapCallback(
            1,
            -1,
            abi.encode(
                RobinhoodStockSwapAdapter.CallbackData({
                    payer: address(this), pool: address(pool), tokenIn: address(usdg)
                })
            )
        );
    }
}
