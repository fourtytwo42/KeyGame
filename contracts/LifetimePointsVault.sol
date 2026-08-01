// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";

/// @notice Persistent, non-transferable points and multi-token rewards.
/// @dev Points earned in round N activate only after N's reward distribution.
contract LifetimePointsVault {
    uint256 public constant ACC_SCALE = 1e30;
    uint8 public constant MAX_REWARD_TOKENS = 16;

    address public immutable manager;
    uint256 public currentRoundId;
    uint256 public totalActivePoints;
    uint256 public totalPendingPoints;

    address[] public rewardTokens;
    mapping(address => bool) public registeredRewardToken;
    mapping(address => bool) public authorizedRound;
    mapping(uint256 => uint8) public roundState; // 1 live, 2 settled, 3 cancelled
    mapping(uint256 => address) public roundContract;

    mapping(address => uint256) public activePoints;
    mapping(address => uint256) public pendingPoints;
    mapping(address => uint256) public pendingRound;
    mapping(address => mapping(bytes32 => uint256)) private activeTickerPoints;
    mapping(address => mapping(bytes32 => uint256)) private pendingTickerPoints;
    mapping(address => bytes32[]) private pendingAssets;
    mapping(address => mapping(bytes32 => bool)) private pendingAssetSeen;
    mapping(bytes32 => uint256) public totalActiveTickerPoints;
    mapping(uint256 => mapping(bytes32 => uint256)) public roundTickerPoints;

    mapping(address => uint256) public accRewardPerPoint;
    mapping(address => uint256) public carriedReward;
    mapping(uint256 => mapping(address => uint256)) public activationIndex;
    mapping(address => mapping(address => uint256)) public rewardDebt;
    mapping(address => mapping(address => uint256)) public storedReward;
    mapping(address => mapping(address => uint256)) public totalClaimed;

    event RoundOpened(uint256 indexed roundId, address indexed round);
    event PendingPointsRecorded(
        uint256 indexed roundId,
        address indexed player,
        bytes32 indexed assetId,
        uint256 points
    );
    event RoundPointsSettled(uint256 indexed roundId, uint256 activatedPoints);
    event RoundPointsCancelled(uint256 indexed roundId, uint256 discardedPoints);
    event LifetimeRewardAdded(
        uint256 indexed roundId,
        address indexed token,
        uint256 amount,
        uint256 eligiblePoints,
        uint256 accumulatorIncrement
    );
    event LifetimeRewardClaimed(
        address indexed player, address indexed token, uint256 amount
    );
    event LifetimeRewardRoundedToBalance(
        address indexed player,
        address indexed token,
        uint256 calculatedAmount,
        uint256 availableBalance
    );

    error Unauthorized();
    error InvalidTransition();
    error TooManyRewardTokens();
    error TransferFailed();

    modifier onlyManager() {
        if (msg.sender != manager) revert Unauthorized();
        _;
    }

    constructor(address manager_) {
        if (manager_ == address(0)) revert Unauthorized();
        manager = manager_;
    }

    function rewardTokenCount() external view returns (uint256) {
        return rewardTokens.length;
    }

    function registerRewardToken(address token) external onlyManager {
        if (token == address(0)) revert Unauthorized();
        if (registeredRewardToken[token]) return;
        if (rewardTokens.length >= MAX_REWARD_TOKENS) {
            revert TooManyRewardTokens();
        }
        registeredRewardToken[token] = true;
        rewardTokens.push(token);
    }

    function openRound(uint256 roundId, address round) external onlyManager {
        if (
            roundId <= currentRoundId || round == address(0) || roundState[roundId] != 0
        ) revert InvalidTransition();
        currentRoundId = roundId;
        roundState[roundId] = 1;
        roundContract[roundId] = round;
        authorizedRound[round] = true;
        emit RoundOpened(roundId, round);
    }

    function recordPending(address player, bytes32 assetId, uint256 points) external {
        uint256 roundId = currentRoundId;
        if (
            !authorizedRound[msg.sender] || msg.sender != roundContract[roundId]
                || roundState[roundId] != 1 || points == 0
        ) revert Unauthorized();
        _sync(player);
        if (pendingRound[player] == 0) pendingRound[player] = roundId;
        if (pendingRound[player] != roundId) revert InvalidTransition();
        pendingPoints[player] += points;
        totalPendingPoints += points;
        pendingTickerPoints[player][assetId] += points;
        roundTickerPoints[roundId][assetId] += points;
        if (!pendingAssetSeen[player][assetId]) {
            pendingAssetSeen[player][assetId] = true;
            pendingAssets[player].push(assetId);
        }
        emit PendingPointsRecorded(roundId, player, assetId, points);
    }

    /// @dev Reward tokens must be transferred to this vault before this call.
    function settleRound(
        uint256 roundId,
        address[4] calldata tokens,
        uint256[4] calldata rewards
    ) external {
        if (
            roundId != currentRoundId || roundState[roundId] != 1
                || !authorizedRound[msg.sender] || msg.sender != roundContract[roundId]
        ) revert Unauthorized();
        uint256 eligible = totalActivePoints;
        for (uint8 i; i < 4; i++) {
            address token = tokens[i];
            uint256 amount = rewards[i] + carriedReward[token];
            uint256 increment;
            if (eligible == 0) {
                carriedReward[token] = amount;
            } else {
                carriedReward[token] = 0;
                increment = (amount * ACC_SCALE) / eligible;
                accRewardPerPoint[token] += increment;
            }
            activationIndex[roundId][token] = accRewardPerPoint[token];
            emit LifetimeRewardAdded(roundId, token, rewards[i], eligible, increment);
        }
        uint256 promoted = totalPendingPoints;
        totalActivePoints += promoted;
        totalPendingPoints = 0;
        roundState[roundId] = 2;
        emit RoundPointsSettled(roundId, promoted);
    }

    function cancelRound(uint256 roundId, bytes32[4] calldata assetIds) external {
        if (
            roundId != currentRoundId || roundState[roundId] != 1
                || !authorizedRound[msg.sender] || msg.sender != roundContract[roundId]
        ) revert Unauthorized();
        uint256 discarded = totalPendingPoints;
        totalPendingPoints = 0;
        for (uint8 i; i < 4; i++) {
            roundTickerPoints[roundId][assetIds[i]] = 0;
        }
        roundState[roundId] = 3;
        emit RoundPointsCancelled(roundId, discarded);
    }

    function pointsOf(address player)
        external
        view
        returns (uint256 active, uint256 pending)
    {
        active = activePoints[player];
        pending = pendingPoints[player];
        if (pending != 0 && roundState[pendingRound[player]] == 2) {
            active += pending;
            pending = 0;
        } else if (pending != 0 && roundState[pendingRound[player]] == 3) {
            pending = 0;
        }
    }

    function tickerPointsOf(address player, bytes32 assetId)
        external
        view
        returns (uint256)
    {
        uint256 value = activeTickerPoints[player][assetId];
        uint256 roundId = pendingRound[player];
        if (roundId != 0 && roundState[roundId] == 2) {
            value += pendingTickerPoints[player][assetId];
        }
        return value;
    }

    function claimable(address player, address token) public view returns (uint256) {
        uint256 current = accRewardPerPoint[token];
        uint256 amount = storedReward[player][token];
        uint256 debt = rewardDebt[player][token];
        uint256 activeAccrued = (activePoints[player] * current) / ACC_SCALE;
        if (activeAccrued > debt) amount += activeAccrued - debt;
        uint256 roundId = pendingRound[player];
        if (
            pendingPoints[player] != 0 && roundState[roundId] == 2
                && current > activationIndex[roundId][token]
        ) {
            amount += (pendingPoints[player]
                    * (current - activationIndex[roundId][token])) / ACC_SCALE;
        }
        uint256 available = IERC20(token).balanceOf(address(this));
        return amount > available ? available : amount;
    }

    function claimFor(address player, address[] calldata tokens) external {
        _sync(player);
        for (uint256 i; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 accumulated =
                (activePoints[player] * accRewardPerPoint[token]) / ACC_SCALE;
            uint256 amount = storedReward[player][token];
            uint256 debt = rewardDebt[player][token];
            if (accumulated > debt) amount += accumulated - debt;
            storedReward[player][token] = 0;
            rewardDebt[player][token] = accumulated;
            uint256 vaultBefore = IERC20(token).balanceOf(address(this));
            if (amount > vaultBefore) {
                emit LifetimeRewardRoundedToBalance(player, token, amount, vaultBefore);
                amount = vaultBefore;
            }
            if (amount == 0) continue;
            totalClaimed[player][token] += amount;
            uint256 playerBefore = IERC20(token).balanceOf(player);
            if (!IERC20(token).transfer(player, amount)) revert TransferFailed();
            if (
                vaultBefore - IERC20(token).balanceOf(address(this)) != amount
                    || IERC20(token).balanceOf(player) - playerBefore != amount
            ) revert TransferFailed();
            emit LifetimeRewardClaimed(player, token, amount);
        }
    }

    function _sync(address player) internal {
        uint256 roundId = pendingRound[player];
        if (roundId == 0) return;
        uint8 state = roundState[roundId];
        if (state != 2 && state != 3) return;
        uint256 oldActive = activePoints[player];
        uint256 pending = pendingPoints[player];
        for (uint256 i; i < rewardTokens.length; i++) {
            address token = rewardTokens[i];
            uint256 current = accRewardPerPoint[token];
            uint256 accumulated = (oldActive * current) / ACC_SCALE;
            uint256 debt = rewardDebt[player][token];
            if (accumulated > debt) {
                storedReward[player][token] += accumulated - debt;
            }
            if (state == 2 && pending != 0 && current > activationIndex[roundId][token])
            {
                storedReward[
                        player
                    ][token] += (pending * (current - activationIndex[roundId][token]))
                    / ACC_SCALE;
            }
        }
        if (state == 2) {
            activePoints[player] = oldActive + pending;
            bytes32[] storage assets = pendingAssets[player];
            for (uint256 i; i < assets.length; i++) {
                bytes32 assetId = assets[i];
                uint256 amount = pendingTickerPoints[player][assetId];
                activeTickerPoints[player][assetId] += amount;
                totalActiveTickerPoints[assetId] += amount;
                pendingTickerPoints[player][assetId] = 0;
                pendingAssetSeen[player][assetId] = false;
            }
        } else {
            bytes32[] storage assets = pendingAssets[player];
            for (uint256 i; i < assets.length; i++) {
                pendingTickerPoints[player][assets[i]] = 0;
                pendingAssetSeen[player][assets[i]] = false;
            }
        }
        delete pendingAssets[player];
        pendingPoints[player] = 0;
        pendingRound[player] = 0;
        for (uint256 i; i < rewardTokens.length; i++) {
            address token = rewardTokens[i];
            rewardDebt[player][token] =
                (activePoints[player] * accRewardPerPoint[token]) / ACC_SCALE;
        }
    }
}
