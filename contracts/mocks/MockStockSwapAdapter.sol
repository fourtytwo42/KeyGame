// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "../interfaces/IERC20.sol";
import { IStockSwapAdapter } from "../interfaces/IStockSwapAdapter.sol";
import { MockStockToken } from "./MockStockToken.sol";
import { MockUSDG } from "./MockUSDG.sol";

contract MockStockSwapAdapter is IStockSwapAdapter {
    MockUSDG public immutable usdg;
    mapping(address => uint256) public stockPerUsdg;
    uint16 public fillBps = 10_000;
    bool public failSwaps;

    error InvalidQuote();
    error Expired();

    constructor(MockUSDG usdg_) {
        usdg = usdg_;
    }

    function setRate(address stock, uint256 stockUnitsPerUsdg) external {
        stockPerUsdg[stock] = stockUnitsPerUsdg;
    }

    function setFailSwaps(bool value) external {
        failSwaps = value;
    }

    function setFillBps(uint16 value) external {
        require(value > 0 && value <= 10_000, "FILL");
        fillBps = value;
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
    ) external returns (uint256 amountInConsumed, uint256 amountOut) {
        if (failSwaps) revert InvalidQuote();
        if (block.timestamp > deadline) revert Expired();
        amountInConsumed = (amountIn * fillBps) / 10_000;
        amountOut = quoteUsdgForStock(stock, amountInConsumed);
        if (amountOut < minimumOut || amountOut == 0) revert InvalidQuote();
        require(
            usdg.transferFrom(msg.sender, address(this), amountInConsumed), "USDG"
        );
        MockStockToken(stock).mint(recipient, amountOut);
    }

    function swapStockForUsdg(
        address stock,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) external returns (uint256 amountInConsumed, uint256 amountOut) {
        if (failSwaps) revert InvalidQuote();
        if (block.timestamp > deadline) revert Expired();
        amountOut = quoteStockForUsdg(stock, amountIn);
        if (amountOut < minimumOut) revert InvalidQuote();
        require(
            IERC20(stock).transferFrom(msg.sender, address(this), amountIn), "STOCK"
        );
        amountInConsumed = amountIn;
        usdg.mint(recipient, amountOut);
    }
}
