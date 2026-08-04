// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IMarketDataVerifier } from "./interfaces/IMarketDataVerifier.sol";
import { FullMath } from "./libraries/FullMath.sol";
import { TickMath } from "./libraries/TickMath.sol";

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee)
        external
        view
        returns (address);
}

interface IUniswapV3Pool {
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
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}

/// @notice Direct Robinhood Chain Uniswap V3 ten-minute TWAP verifier.
contract DexTwapMarketDataVerifier is IMarketDataVerifier {
    uint32 public constant TWAP_WINDOW = 600;
    uint32 public constant REQUIRED_HISTORY = 1800;
    uint24 public constant MAX_SPOT_DEVIATION_TICKS = 100;

    struct Market {
        address pool;
        address stockToken;
        uint24 fee;
        uint128 minimumLiquidity;
        bool enabled;
    }

    IUniswapV3Factory public immutable factory;
    address public immutable usdg;
    address public admin;
    address public authorizer;
    mapping(address => bool) public authorizedCaller;
    mapping(bytes32 => Market) public markets;

    error InvalidMarket();
    error UnsafeMarket();
    error Unauthorized();

    event MarketConfigured(
        bytes32 indexed marketId,
        address indexed pool,
        address indexed stockToken,
        uint24 fee,
        uint128 minimumLiquidity
    );

    constructor(address factory_, address usdg_, address admin_) {
        if (factory_ == address(0) || usdg_ == address(0) || admin_ == address(0)) {
            revert InvalidMarket();
        }
        factory = IUniswapV3Factory(factory_);
        usdg = usdg_;
        admin = admin_;
    }

    function computeMarketId(address pool, address stockToken, uint24 fee)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                block.chainid,
                address(factory),
                pool,
                stockToken,
                usdg,
                fee,
                TWAP_WINDOW
            )
        );
    }

    function configureMarket(
        address pool,
        address stockToken,
        uint24 fee,
        uint128 minimumLiquidity
    ) external returns (bytes32 marketId) {
        if (msg.sender != admin || minimumLiquidity == 0) {
            revert Unauthorized();
        }
        if (
            factory.getPool(stockToken, usdg, fee) != pool
                || IUniswapV3Pool(pool).fee() != fee
                || IERC20Metadata(stockToken).decimals() != 18
                || IERC20Metadata(usdg).decimals() != 6
        ) revert InvalidMarket();
        address token0 = IUniswapV3Pool(pool).token0();
        address token1 = IUniswapV3Pool(pool).token1();
        if (!((token0 == stockToken && token1 == usdg)
                    || (token0 == usdg && token1 == stockToken))) revert InvalidMarket();
        marketId = computeMarketId(pool, stockToken, fee);
        markets[marketId] = Market(pool, stockToken, fee, minimumLiquidity, true);
        emit MarketConfigured(marketId, pool, stockToken, fee, minimumLiquidity);
    }

    function setAuthorizer(address authorizer_) external {
        if (
            msg.sender != admin || authorizer != address(0) || authorizer_ == address(0)
        ) {
            revert Unauthorized();
        }
        authorizer = authorizer_;
    }

    function authorizeCaller(address caller) external {
        if (msg.sender != authorizer || caller == address(0)) revert Unauthorized();
        authorizedCaller[caller] = true;
    }

    function transferAdmin(address nextAdmin) external {
        if (msg.sender != admin || nextAdmin == address(0)) revert Unauthorized();
        admin = nextAdmin;
    }

    function verify(bytes32 marketId, bytes calldata proof)
        external
        view
        returns (
            bytes32 verifiedMarketId,
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
        if (!authorizedCaller[msg.sender] || proof.length != 0) {
            revert Unauthorized();
        }
        Market memory market = markets[marketId];
        if (!market.enabled) revert InvalidMarket();
        IUniswapV3Pool pool = IUniswapV3Pool(market.pool);
        if (pool.liquidity() < market.minimumLiquidity) revert UnsafeMarket();

        (, int24 spotTick,,,,,) = pool.slot0();
        uint32[] memory secondsAgos = new uint32[](3);
        secondsAgos[0] = REQUIRED_HISTORY;
        secondsAgos[1] = TWAP_WINDOW;
        int56[] memory cumulatives;
        (cumulatives,) = pool.observe(secondsAgos);
        int56 delta = cumulatives[2] - cumulatives[1];
        int24 meanTick = int24(delta / int56(uint56(TWAP_WINDOW)));
        if (delta < 0 && delta % int56(uint56(TWAP_WINDOW)) != 0) meanTick--;
        uint24 deviation = spotTick >= meanTick
            ? uint24(spotTick - meanTick)
            : uint24(meanTick - spotTick);
        if (deviation > MAX_SPOT_DEVIATION_TICKS) revert UnsafeMarket();

        price = _quoteOneStock(meanTick, market.stockToken);
        observedAt = uint64(block.timestamp);
        validFrom = observedAt - TWAP_WINDOW;
        expiresAt = observedAt;
        sourceReportHash = keccak256(
            abi.encode(marketId, block.number, cumulatives, meanTick, price)
        );
        return (
            marketId,
            price,
            validFrom,
            observedAt,
            expiresAt,
            sourceReportHash,
            market.pool,
            block.chainid,
            uint64(block.number - 1),
            blockhash(block.number - 1)
        );
    }

    function _quoteOneStock(int24 tick, address stockToken)
        private
        view
        returns (uint256 price18)
    {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
        uint256 usdgRaw;
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            usdgRaw = stockToken < usdg
                ? FullMath.mulDiv(ratioX192, 1e18, 1 << 192)
                : FullMath.mulDiv(1 << 192, 1e18, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            usdgRaw = stockToken < usdg
                ? FullMath.mulDiv(ratioX128, 1e18, 1 << 128)
                : FullMath.mulDiv(1 << 128, 1e18, ratioX128);
        }
        price18 = usdgRaw * 1e12;
        if (price18 == 0) revert UnsafeMarket();
    }
}
