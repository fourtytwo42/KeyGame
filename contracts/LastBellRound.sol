// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";
import { IMarketDataVerifier } from "./interfaces/IMarketDataVerifier.sol";

/// @title Last Bell: Closing Print
/// @notice A bounded last-holder game where every claim puts one ticker on air.
/// @dev Market reports affect only Closing Print score, never fee, timer, or holder payout.
contract LastBellRound {
    enum Phase {
        Scheduled,
        Live,
        Rug,
        Finalizing,
        Settled,
        Cancelled
    }

    enum MarketMode {
        Flat,
        Verified
    }

    enum MarketBand {
        Red,
        Flat,
        Green
    }

    struct RoundSettings {
        uint256 roundId;
        uint256 claimPrice;
        uint64 startDuration;
        uint64 extensionDuration;
        uint64 rugDuration;
        uint64 hardCapDuration;
        uint64 maxReportAge;
        uint16 marketThresholdBps;
        uint16 greenMultiplierBps;
        uint16 flatMultiplierBps;
        uint16 redMultiplierBps;
        MarketMode marketMode;
        bool producerPassRequired;
    }

    struct TickerConfig {
        bytes32 symbol;
        address token;
        bytes32 feedId;
    }

    uint16 public constant HOLDER_BPS = 5_000;
    uint16 public constant CLOSING_PRINT_BPS = 3_000;
    uint16 public constant NEXT_ROUND_BPS = 1_500;
    uint16 public constant PROTOCOL_BPS = 500;
    uint16 public constant BPS = 10_000;
    uint8 public constant NO_TICKER = type(uint8).max;

    IERC20 public immutable paymentToken;
    IMarketDataVerifier public immutable marketVerifier;
    address public immutable operator;
    address public immutable treasury;
    uint256 public immutable roundId;
    uint256 public immutable claimPrice;
    uint64 public immutable startDuration;
    uint64 public immutable extensionDuration;
    uint64 public immutable rugDuration;
    uint64 public immutable hardCapDuration;
    uint64 public immutable maxReportAge;
    uint16 public immutable marketThresholdBps;
    uint16 public immutable greenMultiplierBps;
    uint16 public immutable flatMultiplierBps;
    uint16 public immutable redMultiplierBps;
    MarketMode public immutable marketMode;
    bool public immutable producerPassRequired;

    TickerConfig[4] public tickerConfigs;
    uint256[4] public openingPrices;
    uint64[4] public lastReportAt;
    uint64[4] public lastTickerAcquisitionAt;

    uint64 public startedAt;
    uint64 public deadline;
    uint64 public hardEnd;
    uint64 public lastClaimAt;
    uint64 public settledAt;
    bool public cancelled;
    bool public settled;
    bool private locked;

    address public holder;
    uint8 public holderTicker = NO_TICKER;
    uint8 public winningTicker = NO_TICKER;
    MarketBand public holderBand = MarketBand.Flat;
    uint16 public holderMultiplierBps;
    uint256 public holderPrice;
    uint64 public holderReportAt;
    bool public holderProducerPass;
    uint256 public acceptedClaims;
    uint256 public pot;
    uint256 public holderPool;
    uint256 public closingPrintPool;
    uint256 public nextRoundPool;
    uint256 public protocolPool;

    mapping(address => uint256) public paid;
    mapping(address => uint256) public controlTime;
    mapping(address => uint256) public weightedControl;
    mapping(uint8 => uint256) public tickerAirtime;
    mapping(uint8 => uint256) public tickerScore;
    mapping(address => mapping(uint8 => uint256)) public playerTickerAirtime;
    mapping(address => mapping(uint8 => uint256)) public playerTickerScore;
    mapping(bytes32 => bool) public usedReport;
    mapping(address => bool) public holderRewardClaimed;
    mapping(address => bool) public closingPrintRewardClaimed;
    mapping(address => bool) public refundClaimed;

    event RoundConfigured(
        uint256 indexed roundId,
        address indexed paymentToken,
        address indexed marketVerifier,
        MarketMode marketMode,
        bool producerPassRequired,
        uint256 claimPrice,
        uint64 startDuration,
        uint64 extensionDuration,
        uint64 rugDuration,
        uint64 hardCapDuration,
        bytes32[4] tickerSymbols,
        address[4] tickerTokens,
        bytes32[4] feedIds
    );
    event RoundStarted(
        uint256 indexed roundId,
        uint64 startedAt,
        uint64 deadline,
        uint64 hardEnd,
        uint256 seedPot,
        uint256[4] openingPrices
    );
    event BellClaimed(
        uint256 indexed roundId,
        uint256 indexed sequence,
        address indexed player,
        uint8 ticker,
        address previousHolder,
        uint8 previousTicker,
        uint256 fee,
        uint64 acceptedAt,
        uint64 deadline,
        uint256 pot,
        bool rugZone,
        uint256 verifiedPrice,
        uint64 reportTimestamp,
        MarketBand marketBand,
        uint16 multiplierBps,
        bool producerPass
    );
    event ControlCredited(
        uint256 indexed roundId,
        address indexed player,
        uint8 indexed ticker,
        uint64 intervalStart,
        uint64 intervalEnd,
        uint256 duration,
        uint16 multiplierBps,
        uint256 weightedScore
    );
    event RugZoneObserved(uint256 indexed roundId, uint64 observedAt, uint64 deadline);
    event SettlementStarted(uint256 indexed roundId, uint64 timestamp);
    event RoundSettled(
        uint256 indexed roundId,
        address indexed finalHolder,
        uint8 indexed winningTicker,
        uint256 winningTickerScore,
        uint256 grossPot,
        uint256 holderPool,
        uint256 closingPrintPool,
        uint256 nextRoundPool,
        uint256 protocolPool
    );
    event RewardClaimed(
        uint256 indexed roundId,
        address indexed player,
        bytes32 indexed rewardType,
        uint256 amount
    );
    event RoundCancelled(
        uint256 indexed roundId, bytes32 reason, uint256 refundablePot
    );
    event RefundClaimed(
        uint256 indexed roundId, address indexed player, uint256 amount
    );
    event NextRoundSeedTransferred(
        uint256 indexed roundId, address indexed recipient, uint256 amount
    );

    error Unauthorized();
    error InvalidConfiguration();
    error InvalidPhase(Phase expected, Phase actual);
    error InvalidTicker();
    error InvalidMarketReport();
    error StaleMarketReport();
    error ReplayedMarketReport();
    error ProducerPassRequired();
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
        IMarketDataVerifier marketVerifier_,
        address operator_,
        address treasury_,
        RoundSettings memory settings_,
        TickerConfig[4] memory tickers_
    ) {
        if (
            address(paymentToken_) == address(0) || operator_ == address(0)
                || treasury_ == address(0) || settings_.claimPrice == 0
                || settings_.startDuration == 0 || settings_.extensionDuration == 0
                || settings_.rugDuration == 0
                || settings_.rugDuration >= settings_.startDuration
                || settings_.hardCapDuration < settings_.startDuration
                || settings_.marketThresholdBps == 0
                || settings_.greenMultiplierBps <= settings_.flatMultiplierBps
                || settings_.redMultiplierBps >= settings_.flatMultiplierBps
                || settings_.flatMultiplierBps != BPS
                || (
                    settings_.marketMode == MarketMode.Verified
                        && (
                            address(marketVerifier_) == address(0)
                                || settings_.maxReportAge == 0
                        )
                )
        ) revert InvalidConfiguration();

        bytes32[4] memory symbols;
        address[4] memory tokens;
        bytes32[4] memory feedIds;
        for (uint8 index; index < 4; index++) {
            if (
                tickers_[index].symbol == bytes32(0)
                    || tickers_[index].token == address(0)
                    || (
                        settings_.marketMode == MarketMode.Verified
                            && tickers_[index].feedId == bytes32(0)
                    )
            ) revert InvalidConfiguration();
            tickerConfigs[index] = tickers_[index];
            symbols[index] = tickers_[index].symbol;
            tokens[index] = tickers_[index].token;
            feedIds[index] = tickers_[index].feedId;
        }

        paymentToken = paymentToken_;
        marketVerifier = marketVerifier_;
        operator = operator_;
        treasury = treasury_;
        roundId = settings_.roundId;
        claimPrice = settings_.claimPrice;
        startDuration = settings_.startDuration;
        extensionDuration = settings_.extensionDuration;
        rugDuration = settings_.rugDuration;
        hardCapDuration = settings_.hardCapDuration;
        maxReportAge = settings_.maxReportAge;
        marketThresholdBps = settings_.marketThresholdBps;
        greenMultiplierBps = settings_.greenMultiplierBps;
        flatMultiplierBps = settings_.flatMultiplierBps;
        redMultiplierBps = settings_.redMultiplierBps;
        marketMode = settings_.marketMode;
        producerPassRequired = settings_.producerPassRequired;
        holderMultiplierBps = settings_.flatMultiplierBps;

        emit RoundConfigured(
            settings_.roundId,
            address(paymentToken_),
            address(marketVerifier_),
            settings_.marketMode,
            settings_.producerPassRequired,
            settings_.claimPrice,
            settings_.startDuration,
            settings_.extensionDuration,
            settings_.rugDuration,
            settings_.hardCapDuration,
            symbols,
            tokens,
            feedIds
        );
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

    function start(uint256 seedPot, bytes[4] calldata openingReports)
        external
        onlyOperator
        nonReentrant
    {
        Phase phase = currentPhase();
        if (phase != Phase.Scheduled) revert InvalidPhase(Phase.Scheduled, phase);

        if (marketMode == MarketMode.Verified) {
            for (uint8 index; index < 4; index++) {
                (uint256 price, uint64 observedAt) =
                    _verifyReport(index, openingReports[index]);
                openingPrices[index] = price;
                lastReportAt[index] = observedAt;
            }
        }

        uint64 now64 = uint64(block.timestamp);
        startedAt = now64;
        deadline = now64 + startDuration;
        hardEnd = now64 + hardCapDuration;
        if (seedPot != 0) {
            _pull(operator, seedPot);
            pot = seedPot;
        }

        emit RoundStarted(
            roundId, now64, deadline, hardEnd, seedPot, openingPrices
        );
    }

    function claimBell(uint8 ticker, bytes calldata marketReport, uint8 passTokenIndex)
        external
        nonReentrant
    {
        Phase beforeClaim = currentPhase();
        if (beforeClaim != Phase.Live && beforeClaim != Phase.Rug) {
            revert InvalidPhase(Phase.Live, beforeClaim);
        }
        if (ticker >= 4) revert InvalidTicker();
        if (msg.sender == holder) revert CurrentHolder();

        bool hasPass = _hasProducerPass(msg.sender, passTokenIndex);
        if (producerPassRequired && !hasPass) revert ProducerPassRequired();

        (
            uint256 verifiedPrice,
            uint64 reportTimestamp,
            MarketBand band,
            uint16 multiplier
        ) = _marketState(ticker, marketReport);

        address previousHolder = holder;
        uint8 previousTicker = holderTicker;
        _accrueAirtime(uint64(block.timestamp));
        _pull(msg.sender, claimPrice);
        paid[msg.sender] += claimPrice;
        pot += claimPrice;
        holder = msg.sender;
        holderTicker = ticker;
        holderBand = band;
        holderMultiplierBps = multiplier;
        holderPrice = verifiedPrice;
        holderReportAt = reportTimestamp;
        holderProducerPass = hasPass;
        lastClaimAt = uint64(block.timestamp);
        lastTickerAcquisitionAt[ticker] = uint64(block.timestamp);
        acceptedClaims += 1;

        if (beforeClaim == Phase.Live) {
            uint64 candidate = deadline + extensionDuration;
            deadline = candidate > hardEnd ? hardEnd : candidate;
        } else {
            emit RugZoneObserved(roundId, uint64(block.timestamp), deadline);
        }

        emit BellClaimed(
            roundId,
            acceptedClaims,
            msg.sender,
            ticker,
            previousHolder,
            previousTicker,
            claimPrice,
            uint64(block.timestamp),
            deadline,
            pot,
            beforeClaim == Phase.Rug,
            verifiedPrice,
            reportTimestamp,
            band,
            multiplier,
            hasPass
        );
    }

    function finalize() external {
        Phase phase = currentPhase();
        if (phase != Phase.Finalizing) {
            revert InvalidPhase(Phase.Finalizing, phase);
        }
        emit SettlementStarted(roundId, uint64(block.timestamp));
        _accrueAirtime(deadline < hardEnd ? deadline : hardEnd);

        winningTicker = _leadingTicker();
        holderPool = (pot * HOLDER_BPS) / BPS;
        closingPrintPool = (pot * CLOSING_PRINT_BPS) / BPS;
        nextRoundPool = (pot * NEXT_ROUND_BPS) / BPS;
        protocolPool = pot - holderPool - closingPrintPool - nextRoundPool;
        settled = true;
        settledAt = uint64(block.timestamp);

        emit RoundSettled(
            roundId,
            holder,
            winningTicker,
            tickerScore[winningTicker],
            pot,
            holderPool,
            closingPrintPool,
            nextRoundPool,
            protocolPool
        );
    }

    function claimHolderReward() external nonReentrant {
        if (!settled) revert InvalidPhase(Phase.Settled, currentPhase());
        if (msg.sender != holder || holderRewardClaimed[msg.sender]) {
            revert NothingToClaim();
        }
        holderRewardClaimed[msg.sender] = true;
        _push(msg.sender, holderPool);
        emit RewardClaimed(roundId, msg.sender, "FINAL_HOLDER", holderPool);
    }

    function claimClosingPrintReward() external nonReentrant {
        if (
            !settled || closingPrintRewardClaimed[msg.sender]
                || playerTickerScore[msg.sender][winningTicker] == 0
        ) revert NothingToClaim();

        closingPrintRewardClaimed[msg.sender] = true;
        uint256 amount = (
            closingPrintPool * playerTickerScore[msg.sender][winningTicker]
        ) / tickerScore[winningTicker];
        _push(msg.sender, amount);
        emit RewardClaimed(roundId, msg.sender, "CLOSING_PRINT", amount);
    }

    function cancel(bytes32 reason) external onlyOperator {
        Phase phase = currentPhase();
        if (phase == Phase.Settled || phase == Phase.Cancelled) {
            revert InvalidPhase(Phase.Live, phase);
        }
        cancelled = true;
        emit RoundCancelled(roundId, reason, pot);
    }

    function claimCancellationRefund() external nonReentrant {
        if (!cancelled || refundClaimed[msg.sender] || paid[msg.sender] == 0) {
            revert NothingToClaim();
        }
        refundClaimed[msg.sender] = true;
        uint256 amount = paid[msg.sender];
        _push(msg.sender, amount);
        emit RefundClaimed(roundId, msg.sender, amount);
    }

    function claimProtocolPool() external nonReentrant {
        if (!settled || msg.sender != treasury) revert Unauthorized();
        uint256 amount = protocolPool;
        protocolPool = 0;
        _push(treasury, amount);
        emit RewardClaimed(roundId, treasury, "PROTOCOL_POOL", amount);
    }

    function transferNextRoundSeed(address recipient) external onlyOperator nonReentrant {
        if (!settled || recipient == address(0)) revert Unauthorized();
        uint256 amount = nextRoundPool;
        if (amount == 0) revert NothingToClaim();
        nextRoundPool = 0;
        _push(recipient, amount);
        emit NextRoundSeedTransferred(roundId, recipient, amount);
    }

    function payoutSum() external view returns (uint256) {
        return holderPool + closingPrintPool + nextRoundPool + protocolPool;
    }

    function _marketState(uint8 ticker, bytes calldata report)
        internal
        returns (
            uint256 price,
            uint64 reportTimestamp,
            MarketBand band,
            uint16 multiplier
        )
    {
        if (marketMode == MarketMode.Flat) {
            if (report.length != 0) revert InvalidMarketReport();
            return (0, 0, MarketBand.Flat, flatMultiplierBps);
        }

        (price, reportTimestamp) = _verifyReport(ticker, report);
        uint256 referencePrice = openingPrices[ticker];
        uint256 scaled = price * BPS;
        uint256 greenBoundary = referencePrice * (BPS + marketThresholdBps);
        uint256 redBoundary = referencePrice * (BPS - marketThresholdBps);
        if (scaled >= greenBoundary) {
            return (
                price, reportTimestamp, MarketBand.Green, greenMultiplierBps
            );
        }
        if (scaled <= redBoundary) {
            return (price, reportTimestamp, MarketBand.Red, redMultiplierBps);
        }
        return (price, reportTimestamp, MarketBand.Flat, flatMultiplierBps);
    }

    function _verifyReport(uint8 ticker, bytes calldata report)
        internal
        returns (uint256 price, uint64 observedAt)
    {
        if (report.length == 0) revert InvalidMarketReport();
        bytes32 reportHash = keccak256(report);
        if (usedReport[reportHash]) revert ReplayedMarketReport();
        (
            bytes32 feedId,
            uint256 verifiedPrice,
            uint64 validFrom,
            uint64 reportObservedAt,
            uint64 expiresAt
        ) = marketVerifier.verify(report);
        if (
            feedId != tickerConfigs[ticker].feedId || verifiedPrice == 0
                || validFrom > reportObservedAt || reportObservedAt > block.timestamp
                || expiresAt < block.timestamp
        ) revert InvalidMarketReport();
        if (
            block.timestamp - reportObservedAt > maxReportAge
                || reportObservedAt < lastReportAt[ticker]
        ) revert StaleMarketReport();
        usedReport[reportHash] = true;
        lastReportAt[ticker] = reportObservedAt;
        return (verifiedPrice, reportObservedAt);
    }

    function _hasProducerPass(address player, uint8 passTokenIndex)
        internal
        view
        returns (bool)
    {
        if (passTokenIndex >= 4) return false;
        return IERC20(tickerConfigs[passTokenIndex].token).balanceOf(player) > 0;
    }

    function _accrueAirtime(uint64 until) internal {
        if (holder == address(0) || until <= lastClaimAt) return;
        uint256 duration = until - lastClaimAt;
        uint256 score = duration * holderMultiplierBps;
        controlTime[holder] += duration;
        weightedControl[holder] += score;
        tickerAirtime[holderTicker] += duration;
        tickerScore[holderTicker] += score;
        playerTickerAirtime[holder][holderTicker] += duration;
        playerTickerScore[holder][holderTicker] += score;
        emit ControlCredited(
            roundId,
            holder,
            holderTicker,
            lastClaimAt,
            until,
            duration,
            holderMultiplierBps,
            score
        );
    }

    function _leadingTicker() internal view returns (uint8 leader) {
        uint256 bestScore;
        uint64 latest;
        for (uint8 ticker; ticker < 4; ticker++) {
            uint256 score = tickerScore[ticker];
            uint64 acquisition = lastTickerAcquisitionAt[ticker];
            if (
                score > bestScore
                    || (score == bestScore && acquisition > latest)
            ) {
                bestScore = score;
                latest = acquisition;
                leader = ticker;
            }
        }
    }

    function _pull(address from, uint256 amount) internal {
        if (!paymentToken.transferFrom(from, address(this), amount)) {
            revert TransferFailed();
        }
    }

    function _push(address to, uint256 amount) internal {
        if (!paymentToken.transfer(to, amount)) revert TransferFailed();
    }
}
