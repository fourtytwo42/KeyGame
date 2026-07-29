// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "../interfaces/IERC20.sol";

contract MockStockToken is IERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory symbol_) {
        symbol = symbol_;
        name = string.concat("Synthetic ", symbol_, " Stock Token");
    }

    function mint(address to, uint256 value) external {
        totalSupply += value;
        balanceOf[to] += value;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value)
        external
        returns (bool)
    {
        uint256 available = allowance[from][msg.sender];
        require(available >= value, "ALLOWANCE");
        if (available != type(uint256).max) {
            allowance[from][msg.sender] = available - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "ZERO_ADDRESS");
        require(balanceOf[from] >= value, "BALANCE");
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}
