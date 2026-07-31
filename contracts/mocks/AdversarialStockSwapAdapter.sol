// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "../interfaces/IERC20.sol";
import { IStockSwapAdapter } from "../interfaces/IStockSwapAdapter.sol";
import { MockStockToken } from "./MockStockToken.sol";
import { MockUSDG } from "./MockUSDG.sol";

/// @notice Test-only adapter used to prove that round and manager operations fail atomically.
contract AdversarialStockSwapAdapter is IStockSwapAdapter {
    enum Mode {
        Normal,
        RevertBuy,
        RevertSell,
        LieAboutBuyOutput,
        DeliverPartialBuy,
        Reenter
    }

    MockUSDG public immutable usdg;
    mapping(address => uint256) public stockPerUsdg;
    Mode public mode;
    address public callbackTarget;
    bytes public callbackData;

    error AdversarialFailure();
    error Expired();
    error InvalidQuote();

    constructor(MockUSDG usdg_) {
        usdg = usdg_;
    }

    function setRate(address stock, uint256 rate) external {
        stockPerUsdg[stock] = rate;
    }

    function configure(Mode nextMode, address target, bytes calldata data) external {
        mode = nextMode;
        callbackTarget = target;
        callbackData = data;
    }

    function isStockSupported(address stock) external view returns (bool) {
        return stockPerUsdg[stock] != 0;
    }

    function quoteUsdgForStock(address stock, uint256 amountIn)
        public
        view
        returns (uint256)
    {
        return (amountIn * stockPerUsdg[stock]) / 1e6;
    }

    function quoteStockForUsdg(address stock, uint256 amountIn)
        public
        view
        returns (uint256)
    {
        uint256 rate = stockPerUsdg[stock];
        if (rate == 0) revert InvalidQuote();
        return (amountIn * 1e6) / rate;
    }

    function swapUsdgForStock(
        address stock,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) external returns (uint256 amountOut) {
        if (mode == Mode.RevertBuy) revert AdversarialFailure();
        if (block.timestamp > deadline) revert Expired();
        amountOut = quoteUsdgForStock(stock, amountIn);
        if (amountOut == 0 || amountOut < minimumOut) revert InvalidQuote();
        require(usdg.transferFrom(msg.sender, address(this), amountIn), "USDG");
        if (mode == Mode.Reenter) {
            (bool success,) = callbackTarget.call(callbackData);
            if (success) revert AdversarialFailure();
        }
        uint256 delivered = mode == Mode.DeliverPartialBuy ? amountOut - 1 : amountOut;
        MockStockToken(stock).mint(recipient, delivered);
        if (mode == Mode.LieAboutBuyOutput) return amountOut + 1;
    }

    function swapStockForUsdg(
        address stock,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) external returns (uint256 amountOut) {
        if (mode == Mode.RevertSell) revert AdversarialFailure();
        if (block.timestamp > deadline) revert Expired();
        amountOut = quoteStockForUsdg(stock, amountIn);
        if (amountOut < minimumOut) revert InvalidQuote();
        require(IERC20(stock).transferFrom(msg.sender, address(this), amountIn));
        usdg.mint(recipient, amountOut);
    }
}
