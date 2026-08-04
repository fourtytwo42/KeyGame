// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { TestBase } from "./TestBase.sol";
import { LifetimePointsVault } from "../../contracts/LifetimePointsVault.sol";
import { MockStockToken } from "../../contracts/mocks/MockStockToken.sol";

contract LifetimeRoundDriver {
    LifetimePointsVault private immutable vault;

    constructor(LifetimePointsVault vault_) {
        vault = vault_;
    }

    function record(address player, uint256 points) external {
        vault.recordPending(player, keccak256("AAPL"), points);
    }

    function settle(
        uint256 roundId,
        address[5] calldata tokens,
        uint256[5] calldata rewards
    ) external {
        vault.settleRound(roundId, tokens, rewards);
    }
}

contract LifetimePointsVaultRoundingTest is TestBase {
    LifetimePointsVault private vault;
    LifetimeRoundDriver private driver;
    MockStockToken[4] private tokens;
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);

    function setUp() public {
        vault = new LifetimePointsVault(address(this));
        driver = new LifetimeRoundDriver(vault);
        tokens[0] = new MockStockToken("AAPL");
        tokens[1] = new MockStockToken("NVDA");
        tokens[2] = new MockStockToken("TSLA");
        tokens[3] = new MockStockToken("SPY");
        for (uint256 i; i < tokens.length; i++) {
            vault.registerRewardToken(address(tokens[i]));
        }
    }

    function test_MultiRoundLazyActivationCannotOverdrawRewardBalance() public {
        uint256[7] memory alicePoints = [uint256(8), 13, 3, 13, 2, 18, 6];
        uint256[7] memory bobPoints = [uint256(10), 16, 3, 18, 8, 12, 4];
        uint256[7] memory roundRewards = [uint256(14), 20, 3, 38, 67, 36, 34];
        address[5] memory rewardTokens = [
            address(tokens[0]),
            address(tokens[1]),
            address(tokens[2]),
            address(tokens[3]),
            address(tokens[0])
        ];
        address[] memory aaplOnly = new address[](1);
        aaplOnly[0] = address(tokens[0]);
        uint256 deposited;

        for (uint256 roundId = 1; roundId <= roundRewards.length; roundId++) {
            vault.openRound(roundId, address(driver));
            driver.record(ALICE, alicePoints[roundId - 1]);
            driver.record(BOB, bobPoints[roundId - 1]);
            uint256 reward = roundRewards[roundId - 1];
            deposited += reward;
            tokens[0].mint(address(vault), reward);
            uint256[5] memory rewards;
            rewards[0] = reward;
            driver.settle(roundId, rewardTokens, rewards);
            vault.claimFor(ALICE, aaplOnly);
            vault.claimFor(BOB, aaplOnly);
        }

        uint256 paid = vault.totalClaimed(ALICE, address(tokens[0]))
            + vault.totalClaimed(BOB, address(tokens[0]));
        uint256 remaining = tokens[0].balanceOf(address(vault));
        assertEq(paid + remaining, deposited, "all deposited rewards resolve");
        assertTrue(
            vault.claimable(ALICE, address(tokens[0])) <= remaining,
            "alice claim is solvent"
        );
        assertTrue(
            vault.claimable(BOB, address(tokens[0])) <= remaining,
            "bob claim is solvent"
        );
    }

    function test_RewardCatalogAllowsSixteenStocksPlusUsdg() public {
        LifetimePointsVault catalogVault = new LifetimePointsVault(address(this));

        // Slot zero represents USDG; the next sixteen slots are Stock Tokens.
        for (uint256 i; i < 17; i++) {
            catalogVault.registerRewardToken(address(uint160(0x1000 + i)));
        }
        assertEq(
            catalogVault.rewardTokenCount(),
            17,
            "USDG plus sixteen stocks must fit"
        );

        vm.expectRevert(LifetimePointsVault.TooManyRewardTokens.selector);
        catalogVault.registerRewardToken(address(0x2000));
    }
}
