// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";
import { IPaymentRouter } from "./interfaces/IPaymentRouter.sol";

/// @notice Stable spender shared by every Last Bell round.
/// @dev Players approve this address once; only operator-authorized round
/// contracts can pull the fixed claim fee into their own escrow.
contract PaymentRouter is IPaymentRouter {
    IERC20 public immutable paymentToken;
    address public immutable operator;
    mapping(address => bool) public authorizedRound;

    event RoundAuthorizationChanged(address indexed round, bool authorized);

    error Unauthorized();
    error TransferFailed();

    constructor(IERC20 paymentToken_, address operator_) {
        if (address(paymentToken_) == address(0) || operator_ == address(0)) {
            revert Unauthorized();
        }
        paymentToken = paymentToken_;
        operator = operator_;
    }

    function setRoundAuthorization(address round, bool authorized) external {
        if (msg.sender != operator || round == address(0)) revert Unauthorized();
        authorizedRound[round] = authorized;
        emit RoundAuthorizationChanged(round, authorized);
    }

    function pull(address player, address recipient, uint256 amount) external {
        if (!authorizedRound[msg.sender] || recipient != msg.sender) {
            revert Unauthorized();
        }
        if (!paymentToken.transferFrom(player, recipient, amount)) {
            revert TransferFailed();
        }
    }
}
