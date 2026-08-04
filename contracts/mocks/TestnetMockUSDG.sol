// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "../interfaces/IERC20.sol";

/// @notice Testnet-only payment token with an explicit owner-controlled faucet.
contract TestnetMockUSDG is IERC20 {
    string public constant name = "Last Bell Testnet Dollar";
    string public constant symbol = "tUSDG";
    uint8 public constant decimals = 6;
    bool public constant TESTNET_MOCK_ONLY = true;

    address public owner;
    uint256 public totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(
        address indexed previousOwner, address indexed nextOwner
    );

    error Unauthorized();
    error InvalidTransfer();

    constructor(address owner_) {
        if (owner_ == address(0)) revert Unauthorized();
        owner = owner_;
    }

    function transferOwnership(address nextOwner) external {
        if (msg.sender != owner || nextOwner == address(0)) revert Unauthorized();
        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }

    function mint(address to, uint256 value) external {
        if (msg.sender != owner || to == address(0)) revert Unauthorized();
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
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
        if (available < value) revert InvalidTransfer();
        if (available != type(uint256).max) {
            allowance[from][msg.sender] = available - value;
            emit Approval(from, msg.sender, available - value);
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) private {
        if (to == address(0) || balanceOf[from] < value) {
            revert InvalidTransfer();
        }
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}
