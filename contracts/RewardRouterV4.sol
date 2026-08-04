// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRoundV4 } from "./LastBellRoundV4.sol";
import { LifetimePointsVault } from "./LifetimePointsVault.sol";

contract RewardRouterV4 {
    LifetimePointsVault public immutable lifetimeVault;

    constructor(LifetimePointsVault lifetimeVault_) {
        lifetimeVault = lifetimeVault_;
    }

    function claimAll(
        address player,
        LastBellRoundV4[] calldata holderRounds,
        LastBellRoundV4[] calldata winningRounds,
        LastBellRoundV4[] calldata cancelledRounds,
        address[] calldata lifetimeTokens
    ) external {
        for (uint256 i; i < holderRounds.length; i++) {
            holderRounds[i].claimHolderRewardFor(player);
        }
        for (uint256 i; i < winningRounds.length; i++) {
            winningRounds[i].claimWinningStockRewardFor(player);
        }
        for (uint256 i; i < cancelledRounds.length; i++) {
            cancelledRounds[i].claimCancellationRefundFor(player);
        }
        lifetimeVault.claimFor(player, lifetimeTokens);
    }
}
