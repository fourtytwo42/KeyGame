// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";
import { IStockSwapAdapter } from "./interfaces/IStockSwapAdapter.sol";
import { FullMath } from "./libraries/FullMath.sol";
import { TickMath } from "./libraries/TickMath.sol";

interface IRobinhoodV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee)
        external
        view
        returns (address);
}

interface IRobinhoodV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function liquidity() external view returns (uint128);
    function slot0()
        external
        view
        returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory, uint160[] memory);
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}

interface IERC20MetadataV4 {
    function decimals() external view returns (uint8);
}

interface IMarketConfigurationGuard {
    function marketConfigurationAllowed() external view returns (bool);
}

/// @notice Robinhood Chain mainnet adapter for direct canonical Stock Token/USDG
/// Uniswap V3 pools. It deliberately supports no multihop or arbitrary router.
contract RobinhoodStockSwapAdapter is IStockSwapAdapter {
    uint8 public constant MAX_MARKETS = 16;
    uint32 public constant TWAP_WINDOW = 600;
    uint32 public constant REQUIRED_HISTORY = 1800;
    uint160 private constant MIN_SQRT_RATIO = 4_295_128_739;
    uint160 private constant MAX_SQRT_RATIO =
        1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342;

    struct Market {
        bytes32 symbol;
        bytes32 assetId;
        address pool;
        uint24 fee;
        uint128 minimumLiquidity;
        uint256 minimumUsdgDepth;
        bool enabled;
    }

    struct CallbackData {
        address payer;
        address pool;
        address tokenIn;
    }

    IRobinhoodV3Factory public immutable factory;
    address public immutable usdg;
    address public admin;
    address public pendingAdmin;
    address public configurationGuard;
    uint8 public marketCount;
    address private activePool;
    mapping(address => Market) public markets;
    address[16] public catalog;

    error Unauthorized();
    error InvalidMarket();
    error UnsafeMarket();
    error Expired();
    error InvalidQuote();
    error TransferFailed();
    error Reentrancy();

    event MarketConfigured(
        address indexed stock,
        address indexed pool,
        bytes32 indexed assetId,
        bytes32 symbol,
        uint24 fee,
        uint128 minimumLiquidity,
        uint256 minimumUsdgDepth
    );
    event MarketDisabled(address indexed stock);
    event ConfigurationGuardSet(address indexed guard);
    event AdminTransferProposed(
        address indexed currentAdmin, address indexed pendingAdmin
    );
    event AdminTransferCancelled(
        address indexed currentAdmin, address indexed cancelledPendingAdmin
    );
    event AdminTransferred(address indexed previousAdmin, address indexed nextAdmin);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier configurationWindow() {
        address guard = configurationGuard;
        if (
            guard != address(0)
                && !IMarketConfigurationGuard(guard).marketConfigurationAllowed()
        ) revert Unauthorized();
        _;
    }

    constructor(address factory_, address usdg_, address admin_) {
        if (
            block.chainid != 4663 || factory_ == address(0) || usdg_ == address(0)
                || admin_ == address(0) || IERC20MetadataV4(usdg_).decimals() != 6
        ) revert InvalidMarket();
        factory = IRobinhoodV3Factory(factory_);
        usdg = usdg_;
        admin = admin_;
    }

    function computeMarketId(address pool, address stock, uint24 fee)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                block.chainid, address(factory), pool, stock, usdg, fee, TWAP_WINDOW
            )
        );
    }

    function configureMarket(
        bytes32 symbol,
        bytes32 assetId,
        address stock,
        address pool,
        uint24 fee,
        uint128 minimumLiquidity,
        uint256 minimumUsdgDepth
    ) external onlyAdmin configurationWindow returns (bytes32 marketId) {
        if (
            symbol == bytes32(0) || assetId == bytes32(0) || stock == address(0)
                || pool == address(0) || minimumLiquidity == 0
                || minimumUsdgDepth < 10_000e6
                || IERC20MetadataV4(stock).decimals() != 18
                || factory.getPool(stock, usdg, fee) != pool
                || IRobinhoodV3Pool(pool).fee() != fee
        ) revert InvalidMarket();
        address token0 = IRobinhoodV3Pool(pool).token0();
        address token1 = IRobinhoodV3Pool(pool).token1();
        if (!((token0 == stock && token1 == usdg)
                    || (token0 == usdg && token1 == stock))) revert InvalidMarket();
        Market storage prior = markets[stock];
        if (prior.pool == address(0)) {
            if (marketCount == MAX_MARKETS) revert InvalidMarket();
            catalog[marketCount] = stock;
            marketCount += 1;
        } else if (prior.assetId != assetId) {
            revert InvalidMarket();
        }
        markets[stock] = Market({
            symbol: symbol,
            assetId: assetId,
            pool: pool,
            fee: fee,
            minimumLiquidity: minimumLiquidity,
            minimumUsdgDepth: minimumUsdgDepth,
            enabled: true
        });
        marketId = computeMarketId(pool, stock, fee);
        emit MarketConfigured(
            stock, pool, assetId, symbol, fee, minimumLiquidity, minimumUsdgDepth
        );
    }

    function disableMarket(address stock) external onlyAdmin configurationWindow {
        if (markets[stock].pool == address(0)) revert InvalidMarket();
        markets[stock].enabled = false;
        emit MarketDisabled(stock);
    }

    function setConfigurationGuard(address guard) external onlyAdmin {
        if (configurationGuard != address(0) || guard == address(0)) {
            revert Unauthorized();
        }
        configurationGuard = guard;
        emit ConfigurationGuardSet(guard);
    }

    function proposeAdmin(address nextAdmin) external onlyAdmin {
        if (nextAdmin == address(0)) revert Unauthorized();
        pendingAdmin = nextAdmin;
        emit AdminTransferProposed(admin, nextAdmin);
    }

    function cancelAdminTransfer() external onlyAdmin {
        address cancelledPendingAdmin = pendingAdmin;
        if (cancelledPendingAdmin == address(0)) revert Unauthorized();
        pendingAdmin = address(0);
        emit AdminTransferCancelled(admin, cancelledPendingAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert Unauthorized();
        address previous = admin;
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminTransferred(previous, msg.sender);
    }

    function quoteUsdgForStock(address stock, uint256 amountIn)
        external
        view
        returns (uint256 amountOut)
    {
        Market memory market = _safeMarket(stock, true);
        int24 tick = _twapTick(market.pool);
        amountOut = _quoteAtTick(tick, usdg, stock, amountIn);
        if (amountOut == 0) revert InvalidQuote();
    }

    function isStockSupported(address stock) external view returns (bool) {
        return markets[stock].enabled;
    }

    function quoteStockForUsdg(address stock, uint256 amountIn)
        external
        view
        returns (uint256 amountOut)
    {
        Market memory market = _safeMarket(stock, false);
        int24 tick = _twapTick(market.pool);
        amountOut = _quoteAtTick(tick, stock, usdg, amountIn);
        if (amountOut == 0) revert InvalidQuote();
    }

    function swapUsdgForStock(
        address stock,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) external returns (uint256 amountInConsumed, uint256 amountOut) {
        return _swap(stock, usdg, stock, amountIn, minimumOut, deadline, recipient);
    }

    function swapStockForUsdg(
        address stock,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) external returns (uint256 amountInConsumed, uint256 amountOut) {
        (amountInConsumed, amountOut) =
            _swap(stock, stock, usdg, amountIn, minimumOut, deadline, recipient);
        // Stock sells are operational seed/protocol conversions, never player
        // contributions. A range-boundary partial conversion must roll back.
        if (amountInConsumed != amountIn) revert TransferFailed();
    }

    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata encoded
    ) external {
        CallbackData memory data = abi.decode(encoded, (CallbackData));
        if (
            msg.sender != activePool || msg.sender != data.pool
                || (amount0Delta <= 0 && amount1Delta <= 0)
        ) revert Unauthorized();
        uint256 owed = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        uint256 beforeBalance = IERC20(data.tokenIn).balanceOf(data.pool);
        if (!IERC20(data.tokenIn).transferFrom(data.payer, data.pool, owed)) {
            revert TransferFailed();
        }
        if (IERC20(data.tokenIn).balanceOf(data.pool) - beforeBalance != owed) {
            revert TransferFailed();
        }
    }

    function _swap(
        address stock,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) private returns (uint256 amountInConsumed, uint256 amountOut) {
        if (
            block.timestamp > deadline || amountIn == 0 || minimumOut == 0
                || recipient == address(0)
        ) revert Expired();
        if (activePool != address(0)) revert Reentrancy();
        Market memory market = _safeMarket(stock, tokenIn == usdg);
        IRobinhoodV3Pool pool = IRobinhoodV3Pool(market.pool);
        bool zeroForOne = tokenIn == pool.token0();
        uint256 beforeBalance = IERC20(tokenOut).balanceOf(recipient);
        activePool = market.pool;
        (int256 amount0, int256 amount1) = pool.swap(
            recipient,
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            abi.encode(
                CallbackData({ payer: msg.sender, pool: market.pool, tokenIn: tokenIn })
            )
        );
        activePool = address(0);
        int256 inputDelta = zeroForOne ? amount0 : amount1;
        if (inputDelta <= 0) revert TransferFailed();
        amountInConsumed = uint256(inputDelta);
        uint256 reported = uint256(-(zeroForOne ? amount1 : amount0));
        amountOut = IERC20(tokenOut).balanceOf(recipient) - beforeBalance;
        if (
            amountInConsumed > amountIn || amountOut != reported
                || amountOut < minimumOut || amountOut == 0
        ) {
            revert TransferFailed();
        }
    }

    function _safeMarket(address stock, bool requireEnabled)
        private
        view
        returns (Market memory market)
    {
        market = markets[stock];
        if (market.pool == address(0) || (requireEnabled && !market.enabled)) {
            revert InvalidMarket();
        }
        IRobinhoodV3Pool pool = IRobinhoodV3Pool(market.pool);
        // Pool price movement and declining inventory are market behavior, not
        // reasons to disable gameplay. Only a pool with no active liquidity is
        // technically incapable of executing a contribution.
        if (pool.liquidity() == 0) revert UnsafeMarket();
    }

    function _twapTick(address pool) private view returns (int24 tick) {
        uint32[] memory secondsAgos = new uint32[](3);
        secondsAgos[0] = REQUIRED_HISTORY;
        secondsAgos[1] = TWAP_WINDOW;
        secondsAgos[2] = 0;
        (int56[] memory cumulatives,) = IRobinhoodV3Pool(pool).observe(secondsAgos);
        int56 delta = cumulatives[2] - cumulatives[1];
        tick = int24(delta / int56(uint56(TWAP_WINDOW)));
        if (delta < 0 && delta % int56(uint56(TWAP_WINDOW)) != 0) tick--;
    }

    function _quoteAtTick(
        int24 tick,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) private pure returns (uint256 amountOut) {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            amountOut = tokenIn < tokenOut
                ? FullMath.mulDiv(ratioX192, amountIn, 1 << 192)
                : FullMath.mulDiv(1 << 192, amountIn, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            amountOut = tokenIn < tokenOut
                ? FullMath.mulDiv(ratioX128, amountIn, 1 << 128)
                : FullMath.mulDiv(1 << 128, amountIn, ratioX128);
        }
    }

}
