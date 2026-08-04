// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "../interfaces/IERC20.sol";

contract AdversarialERC20 is IERC20 {
    enum Mode {
        Normal,
        ReturnFalse,
        RevertTransfer,
        FeeOnTransfer,
        Callback
    }

    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    Mode public mode;
    uint16 public feeBps;
    address public callbackTarget;
    bytes public callbackData;

    constructor(string memory symbol_, uint8 decimals_) {
        symbol = symbol_;
        decimals = decimals_;
    }

    function configure(
        Mode nextMode,
        uint16 nextFeeBps,
        address target,
        bytes calldata data
    ) external {
        mode = nextMode;
        feeBps = nextFeeBps;
        callbackTarget = target;
        callbackData = data;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        uint256 available = allowance[from][msg.sender];
        require(available >= amount, "ALLOWANCE");
        if (available != type(uint256).max) {
            allowance[from][msg.sender] = available - amount;
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount)
        internal
        returns (bool)
    {
        if (mode == Mode.ReturnFalse) return false;
        if (mode == Mode.RevertTransfer) revert("ADVERSARIAL_TRANSFER");
        require(to != address(0) && balanceOf[from] >= amount, "TRANSFER");
        balanceOf[from] -= amount;
        uint256 fee = mode == Mode.FeeOnTransfer ? (amount * feeBps) / 10_000 : 0;
        balanceOf[to] += amount - fee;
        totalSupply -= fee;
        if (mode == Mode.Callback) {
            (bool success,) = callbackTarget.call(callbackData);
            require(!success, "CALLBACK_SUCCEEDED");
        }
        return true;
    }
}
