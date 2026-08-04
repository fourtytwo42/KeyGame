// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IPaymentRouter {
    function pull(address player, address recipient, uint256 amount) external;
}
