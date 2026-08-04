// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";
import { IPaymentRouter } from "./interfaces/IPaymentRouter.sol";
import { IStockSwapAdapter } from "./interfaces/IStockSwapAdapter.sol";
import { LifetimePointsVault } from "./LifetimePointsVault.sol";
import { LastBellRoundV4 } from "./LastBellRoundV4.sol";

/// @notice Deploys sequential v5 rounds without embedding round creation code
/// in the manager's runtime bytecode.
contract RoundFactoryV5 {
    address public immutable manager;

    error Unauthorized();

    constructor() {
        manager = msg.sender;
    }

    function deployRound(
        IERC20 paymentToken,
        IPaymentRouter paymentRouter,
        IStockSwapAdapter swapAdapter,
        LifetimePointsVault lifetimeVault,
        address treasury,
        LastBellRoundV4.RoundSettings calldata settings,
        LastBellRoundV4.TickerConfig[4] calldata tickers
    ) external returns (LastBellRoundV4 round) {
        if (msg.sender != manager) revert Unauthorized();
        round = new LastBellRoundV4(
            paymentToken,
            paymentRouter,
            swapAdapter,
            lifetimeVault,
            manager,
            treasury,
            settings,
            tickers
        );
    }
}
