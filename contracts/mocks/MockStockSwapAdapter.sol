// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "../interfaces/IERC20.sol";
import { IStockSwapAdapter } from "../interfaces/IStockSwapAdapter.sol";
import { MockStockToken } from "./MockStockToken.sol";
import { MockUSDG } from "./MockUSDG.sol";

contract MockStockSwapAdapter is IStockSwapAdapter {
    MockUSDG public immutable usdg;
    mapping(address => uint256) public stockPerUsdg;
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

    function quoteUsdgForStock(address stock, uint256 amountIn)
        public
        view
        returns (uint256)
    {
        return (amountIn * stockPerUsdg[stock]) / 1e6;
    }

    function swapUsdgForStock(
        address stock,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) external returns (uint256 amountOut) {
        if (failSwaps) revert InvalidQuote();
        if (block.timestamp > deadline) revert Expired();
        amountOut = quoteUsdgForStock(stock, amountIn);
        if (amountOut < minimumOut || amountOut == 0) revert InvalidQuote();
        require(usdg.transferFrom(msg.sender, address(this), amountIn), "USDG");
        MockStockToken(stock).mint(recipient, amountOut);
    }

    function swapStockForUsdg(
        address stock,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) external returns (uint256 amountOut) {
        if (failSwaps) revert InvalidQuote();
        if (block.timestamp > deadline) revert Expired();
        uint256 rate = stockPerUsdg[stock];
        if (rate == 0) revert InvalidQuote();
        amountOut = (amountIn * 1e6) / rate;
        if (amountOut < minimumOut) revert InvalidQuote();
        require(
            IERC20(stock).transferFrom(msg.sender, address(this), amountIn), "STOCK"
        );
        usdg.mint(recipient, amountOut);
    }
}
