// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IStockSwapAdapter {
    function isStockSupported(address stock) external view returns (bool);

    function swapUsdgForStock(
        address stock,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) external returns (uint256 amountOut);

    function swapStockForUsdg(
        address stock,
        uint256 amountIn,
        uint256 minimumOut,
        uint64 deadline,
        address recipient
    ) external returns (uint256 amountOut);

    function quoteUsdgForStock(address stock, uint256 amountIn)
        external
        view
        returns (uint256 amountOut);

    function quoteStockForUsdg(address stock, uint256 amountIn)
        external
        view
        returns (uint256 amountOut);
}
