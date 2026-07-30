// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";
import { IPaymentRouter } from "./interfaces/IPaymentRouter.sol";
import { IStockSwapAdapter } from "./interfaces/IStockSwapAdapter.sol";
import { LifetimePointsVault } from "./LifetimePointsVault.sol";

/// @title Last Bell v4: Stock Pot
contract LastBellRoundV4 {
    enum Phase {
        Scheduled,
        Live,
        Rug,
        Finalizing,
        Settled,
        Cancelled
    }

    struct RoundSettings {
        uint256 roundId;
        uint64 startDuration;
        uint64 extensionDuration;
        uint64 rugDuration;
        uint64 hardCapDuration;
        uint256 heatTarget;
        bool producerPassRequired;
    }

    struct TickerConfig {
        bytes32 symbol;
        bytes32 assetId;
        address token;
    }

    uint16 public constant HOLDER_BPS = 5_000;
    uint16 public constant WINNING_STOCK_BPS = 3_000;
    uint16 public constant LIFETIME_BPS = 1_000;
    uint16 public constant NEXT_ROUND_BPS = 500;
    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_MULTIPLIER_BPS = 20_000;
    uint256 public constant MIN_CONTRIBUTION = 1e6;
    uint8 public constant NO_TICKER = type(uint8).max;
    bytes32 public constant CONTRACT_VERSION = "last-bell-v4-stock-pot";

    IERC20 public immutable paymentToken;
    IPaymentRouter public immutable paymentRouter;
    IStockSwapAdapter public immutable swapAdapter;
    LifetimePointsVault public immutable lifetimeVault;
    address public immutable operator;
    address public immutable treasury;
    uint256 public immutable roundId;
    uint64 public immutable startDuration;
    uint64 public immutable extensionDuration;
    uint64 public immutable rugDuration;
    uint64 public immutable hardCapDuration;
    uint256 public immutable heatTarget;
    bool public immutable producerPassRequired;

    TickerConfig[4] public tickerConfigs;
    uint64 public startedAt;
    uint64 public deadline;
    uint64 public hardEnd;
    uint64 public settledAt;
    bool public initialized;
    bool public settled;
    bool public cancelled;
    bool private locked;
    address public holder;
    uint8 public holderTicker = NO_TICKER;
    uint8 public winningTicker = NO_TICKER;
    uint256 public acceptedClaims;
    uint256 public totalContributed;
    uint256 public largestCall;
    uint256 public totalWinningPointsClaimed;

    uint256[4] public accountedStock;
    uint256[4] public seedStock;
    uint256[4] public tickerPoints;
    uint64[4] public lastTickerContributionAt;
    uint256[4] public holderPool;
    uint256[4] public winningStockPool;
    uint256[4] public lifetimePool;
    uint256[4] public nextRoundPool;
    uint256[4] public protocolPool;
    uint256[4] public winningPoolPaid;
    uint256[4][6] private volumeBuckets;
    uint64[6] private volumeBucketEpoch;

    mapping(address => uint256) public paid;
    mapping(address => mapping(uint8 => uint256)) public playerTickerPoints;
    mapping(address => mapping(uint8 => uint256)) public playerPurchasedStock;
    mapping(address => bool) public holderRewardClaimed;
    mapping(address => bool) public winningRewardClaimed;
    mapping(address => bool) public refundClaimed;

    event BellClaimed(
        uint256 indexed roundId,
        uint256 indexed sequence,
        address indexed player,
        uint8 ticker,
        address previousHolder,
        uint256 usdgAmount,
        uint256 stockReceived,
        uint16 multiplierBps,
        uint256 points,
        uint256 recentVolume,
        uint64 acceptedAt,
        uint64 deadline,
        bool rugZone
    );
    event RoundStarted(
        uint256 indexed roundId, uint64 startedAt, uint64 deadline, uint64 hardEnd
    );
    event RoundSettled(
        uint256 indexed roundId,
        address indexed finalHolder,
        uint8 indexed winningTicker,
        uint256 winningTickerPoints,
        uint256 totalContributed,
        uint256[4] accountedStock,
        bytes32 contractVersion
    );
    event BasketRewardClaimed(
        uint256 indexed roundId,
        address indexed player,
        bytes32 indexed rewardType,
        uint256[4] amounts
    );
    event RoundCancelled(uint256 indexed roundId, bytes32 reason);

    error Unauthorized();
    error InvalidConfiguration();
    error InvalidPhase();
    error InvalidTicker();
    error InvalidAmount();
    error CurrentHolder();
    error NothingToClaim();
    error TransferFailed();
    error Reentrancy();

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    constructor(
        IERC20 paymentToken_,
        IPaymentRouter paymentRouter_,
        IStockSwapAdapter swapAdapter_,
        LifetimePointsVault lifetimeVault_,
        address operator_,
        address treasury_,
        RoundSettings memory settings_,
        TickerConfig[4] memory tickers_
    ) {
        if (
            address(paymentToken_) == address(0)
                || address(paymentRouter_) == address(0)
                || address(swapAdapter_) == address(0)
                || address(lifetimeVault_) == address(0)
                || operator_ == address(0) || treasury_ == address(0)
                || settings_.startDuration == 0
                || settings_.rugDuration >= settings_.startDuration
                || settings_.hardCapDuration < settings_.startDuration
                || settings_.heatTarget == 0
        ) revert InvalidConfiguration();
        for (uint8 i; i < 4; i++) {
            if (
                tickers_[i].symbol == bytes32(0)
                    || tickers_[i].assetId == bytes32(0)
                    || tickers_[i].token == address(0)
            ) revert InvalidConfiguration();
            tickerConfigs[i] = tickers_[i];
        }
        paymentToken = paymentToken_;
        paymentRouter = paymentRouter_;
        swapAdapter = swapAdapter_;
        lifetimeVault = lifetimeVault_;
        operator = operator_;
        treasury = treasury_;
        roundId = settings_.roundId;
        startDuration = settings_.startDuration;
        extensionDuration = settings_.extensionDuration;
        rugDuration = settings_.rugDuration;
        hardCapDuration = settings_.hardCapDuration;
        heatTarget = settings_.heatTarget;
        producerPassRequired = settings_.producerPassRequired;
        if (!paymentToken_.approve(address(swapAdapter_), type(uint256).max)) {
            revert TransferFailed();
        }
    }

    function currentPhase() public view returns (Phase) {
        if (cancelled) return Phase.Cancelled;
        if (settled) return Phase.Settled;
        if (startedAt == 0) return Phase.Scheduled;
        if (block.timestamp >= deadline || block.timestamp >= hardEnd) {
            return Phase.Finalizing;
        }
        if (deadline - block.timestamp <= rugDuration) return Phase.Rug;
        return Phase.Live;
    }

    function start(uint256[4] calldata seeds) external onlyOperator {
        if (initialized) revert InvalidPhase();
        for (uint8 i; i < 4; i++) {
            if (IERC20(tickerConfigs[i].token).balanceOf(address(this)) < seeds[i]) {
                revert TransferFailed();
            }
            seedStock[i] = seeds[i];
            accountedStock[i] = seeds[i];
        }
        initialized = true;
    }

    function recentVolume(uint8 ticker) public view returns (uint256 total) {
        if (ticker >= 4) revert InvalidTicker();
        uint64 current = uint64(block.timestamp / 5);
        for (uint8 i; i < 6; i++) {
            if (current >= volumeBucketEpoch[i] && current - volumeBucketEpoch[i] < 6) {
                total += volumeBuckets[i][ticker];
            }
        }
    }

    function currentMultiplierBps(uint8 ticker)
        public
        view
        returns (uint16)
    {
        uint256 volume = recentVolume(ticker);
        if (volume >= heatTarget) return MAX_MULTIPLIER_BPS;
        uint256 ratio = (volume * 1e18) / heatTarget;
        uint256 root = _sqrt(ratio);
        return uint16(BPS + (root * BPS) / 1e9);
    }

    function previewPoints(uint8 ticker, uint256 amount)
        external
        view
        returns (uint16 multiplierBps, uint256 points, uint256 volume)
    {
        volume = recentVolume(ticker);
        multiplierBps = currentMultiplierBps(ticker);
        points = (amount * multiplierBps) / BPS;
    }

    function claimBell(
        uint8 ticker,
        uint256 usdgAmount,
        uint256 minimumStockOut,
        uint64 quoteDeadline,
        uint8 passTokenIndex
    ) external nonReentrant {
        Phase phase = currentPhase();
        if (!initialized || (phase != Phase.Scheduled && phase != Phase.Live && phase != Phase.Rug)) {
            revert InvalidPhase();
        }
        if (ticker >= 4) revert InvalidTicker();
        if (usdgAmount < MIN_CONTRIBUTION || minimumStockOut == 0) {
            revert InvalidAmount();
        }
        if (msg.sender == holder) revert CurrentHolder();
        if (producerPassRequired && !_hasProducerPass(msg.sender, passTokenIndex)) {
            revert Unauthorized();
        }
        uint256 volume = recentVolume(ticker);
        uint16 multiplier = currentMultiplierBps(ticker);
        uint256 points = (usdgAmount * multiplier) / BPS;
        address previousHolder = holder;
        paymentRouter.pull(msg.sender, address(this), usdgAmount);
        uint256 beforeBalance =
            IERC20(tickerConfigs[ticker].token).balanceOf(address(this));
        uint256 stockReceived = swapAdapter.swapUsdgForStock(
            tickerConfigs[ticker].token,
            usdgAmount,
            minimumStockOut,
            quoteDeadline,
            address(this)
        );
        uint256 delta =
            IERC20(tickerConfigs[ticker].token).balanceOf(address(this))
                - beforeBalance;
        if (delta != stockReceived || delta < minimumStockOut) {
            revert TransferFailed();
        }
        if (phase == Phase.Scheduled) {
            startedAt = uint64(block.timestamp);
            deadline = startedAt + startDuration;
            hardEnd = startedAt + hardCapDuration;
            emit RoundStarted(roundId, startedAt, deadline, hardEnd);
        } else if (phase == Phase.Live) {
            uint64 candidate = deadline + extensionDuration;
            deadline = candidate > hardEnd ? hardEnd : candidate;
        }
        paid[msg.sender] += usdgAmount;
        totalContributed += usdgAmount;
        if (usdgAmount > largestCall) largestCall = usdgAmount;
        accountedStock[ticker] += delta;
        playerPurchasedStock[msg.sender][ticker] += delta;
        playerTickerPoints[msg.sender][ticker] += points;
        tickerPoints[ticker] += points;
        lastTickerContributionAt[ticker] = uint64(block.timestamp);
        lifetimeVault.recordPending(msg.sender, tickerConfigs[ticker].assetId, points);
        _recordVolume(ticker, usdgAmount);
        holder = msg.sender;
        holderTicker = ticker;
        acceptedClaims += 1;
        emit BellClaimed(
            roundId,
            acceptedClaims,
            msg.sender,
            ticker,
            previousHolder,
            usdgAmount,
            delta,
            multiplier,
            points,
            volume,
            uint64(block.timestamp),
            deadline,
            phase == Phase.Rug
        );
    }

    function finalize() external onlyOperator nonReentrant {
        if (currentPhase() != Phase.Finalizing) revert InvalidPhase();
        winningTicker = _leadingTicker();
        address[4] memory tokens;
        uint256[4] memory lifetimeRewards;
        for (uint8 i; i < 4; i++) {
            uint256 balance = accountedStock[i];
            holderPool[i] = (balance * HOLDER_BPS) / BPS;
            winningStockPool[i] = (balance * WINNING_STOCK_BPS) / BPS;
            lifetimePool[i] = (balance * LIFETIME_BPS) / BPS;
            nextRoundPool[i] = (balance * NEXT_ROUND_BPS) / BPS;
            protocolPool[i] = balance - holderPool[i] - winningStockPool[i]
                - lifetimePool[i] - nextRoundPool[i];
            tokens[i] = tickerConfigs[i].token;
            lifetimeRewards[i] = lifetimePool[i];
            if (lifetimePool[i] != 0) {
                if (!IERC20(tokens[i]).transfer(address(lifetimeVault), lifetimePool[i])) {
                    revert TransferFailed();
                }
            }
        }
        lifetimeVault.settleRound(roundId, tokens, lifetimeRewards);
        settled = true;
        settledAt = uint64(block.timestamp);
        emit RoundSettled(
            roundId,
            holder,
            winningTicker,
            tickerPoints[winningTicker],
            totalContributed,
            accountedStock,
            CONTRACT_VERSION
        );
    }

    function claimHolderRewardFor(address player) public nonReentrant {
        if (!settled || player != holder || holderRewardClaimed[player]) {
            revert NothingToClaim();
        }
        holderRewardClaimed[player] = true;
        uint256[4] memory amounts = holderPool;
        _transferBasket(player, amounts);
        emit BasketRewardClaimed(roundId, player, "FINAL_HOLDER", amounts);
    }

    function claimWinningStockRewardFor(address player) public nonReentrant {
        uint256 points = playerTickerPoints[player][winningTicker];
        if (!settled || points == 0 || winningRewardClaimed[player]) {
            revert NothingToClaim();
        }
        winningRewardClaimed[player] = true;
        totalWinningPointsClaimed += points;
        uint256 total = tickerPoints[winningTicker];
        uint256[4] memory amounts;
        for (uint8 i; i < 4; i++) {
            if (totalWinningPointsClaimed == total) {
                amounts[i] = winningStockPool[i] - winningPoolPaid[i];
            } else {
                amounts[i] = (winningStockPool[i] * points) / total;
            }
            winningPoolPaid[i] += amounts[i];
        }
        _transferBasket(player, amounts);
        emit BasketRewardClaimed(roundId, player, "WINNING_STOCK", amounts);
    }

    function claimCancellationRefundFor(address player) public nonReentrant {
        if (!cancelled || refundClaimed[player] || paid[player] == 0) {
            revert NothingToClaim();
        }
        refundClaimed[player] = true;
        uint256[4] memory amounts;
        for (uint8 i; i < 4; i++) {
            amounts[i] = playerPurchasedStock[player][i];
        }
        _transferBasket(player, amounts);
        emit BasketRewardClaimed(roundId, player, "CANCEL_REFUND", amounts);
    }

    function claimProtocolBasket(address recipient)
        external
        nonReentrant
    {
        if (!settled || msg.sender != treasury || recipient == address(0)) {
            revert Unauthorized();
        }
        uint256[4] memory amounts = protocolPool;
        delete protocolPool;
        _transferBasket(recipient, amounts);
        emit BasketRewardClaimed(roundId, recipient, "PROTOCOL", amounts);
    }

    function transferNextRoundSeed(address recipient)
        external
        onlyOperator
        nonReentrant
        returns (uint256[4] memory amounts)
    {
        if (!settled || recipient == address(0)) revert Unauthorized();
        amounts = nextRoundPool;
        delete nextRoundPool;
        _transferBasket(recipient, amounts);
    }

    function cancel(bytes32 reason) external onlyOperator {
        if (settled || cancelled) revert InvalidPhase();
        cancelled = true;
        bytes32[4] memory assets;
        for (uint8 i; i < 4; i++) assets[i] = tickerConfigs[i].assetId;
        lifetimeVault.cancelRound(roundId, assets);
        emit RoundCancelled(roundId, reason);
    }

    function recoverCancelledSeed(address recipient)
        external
        onlyOperator
        nonReentrant
    {
        if (!cancelled || recipient == address(0)) revert Unauthorized();
        uint256[4] memory amounts = seedStock;
        delete seedStock;
        _transferBasket(recipient, amounts);
    }

    function _recordVolume(uint8 ticker, uint256 amount) internal {
        uint64 epoch = uint64(block.timestamp / 5);
        uint8 slot = uint8(epoch % 6);
        if (volumeBucketEpoch[slot] != epoch) {
            volumeBucketEpoch[slot] = epoch;
            for (uint8 i; i < 4; i++) volumeBuckets[slot][i] = 0;
        }
        volumeBuckets[slot][ticker] += amount;
    }

    function _leadingTicker() internal view returns (uint8 leader) {
        for (uint8 i = 1; i < 4; i++) {
            if (
                tickerPoints[i] > tickerPoints[leader]
                    || (
                        tickerPoints[i] == tickerPoints[leader]
                            && lastTickerContributionAt[i]
                                > lastTickerContributionAt[leader]
                    )
            ) leader = i;
        }
    }

    function _hasProducerPass(address player, uint8 index)
        internal
        view
        returns (bool)
    {
        if (index >= 4) return false;
        return IERC20(tickerConfigs[index].token).balanceOf(player) > 0;
    }

    function _transferBasket(address recipient, uint256[4] memory amounts)
        internal
    {
        for (uint8 i; i < 4; i++) {
            if (
                amounts[i] != 0
                    && !IERC20(tickerConfigs[i].token).transfer(recipient, amounts[i])
            ) revert TransferFailed();
        }
    }

    function _sqrt(uint256 value) internal pure returns (uint256 result) {
        if (value == 0) return 0;
        result = 1 << ((255 - _clz(value)) >> 1);
        for (uint8 i; i < 7; i++) result = (result + value / result) >> 1;
        uint256 roundedDown = value / result;
        return result < roundedDown ? result : roundedDown;
    }

    function _clz(uint256 x) private pure returns (uint256 n) {
        if (x >> 128 == 0) { n += 128; x <<= 128; }
        if (x >> 192 == 0) { n += 64; x <<= 64; }
        if (x >> 224 == 0) { n += 32; x <<= 32; }
        if (x >> 240 == 0) { n += 16; x <<= 16; }
        if (x >> 248 == 0) { n += 8; x <<= 8; }
        if (x >> 252 == 0) { n += 4; x <<= 4; }
        if (x >> 254 == 0) { n += 2; x <<= 2; }
        if (x >> 255 == 0) n += 1;
    }
}
