// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";

/// @title Last Bell Round
/// @notice A bounded last-holder game for a single preconfigured round.
/// @dev The contract intentionally excludes referrals, emissions, randomness, and upgrades.
contract LastBellRound {
    enum Phase {
        Scheduled,
        Live,
        Rug,
        Finalizing,
        Settled,
        Cancelled
    }

    uint16 public constant HOLDER_BPS = 5_000;
    uint16 public constant FACTION_BPS = 3_000;
    uint16 public constant NEXT_ROUND_BPS = 1_500;
    uint16 public constant PROTOCOL_BPS = 500;
    uint16 public constant BPS = 10_000;
    uint8 public constant NO_FACTION = type(uint8).max;

    IERC20 public immutable paymentToken;
    address public immutable operator;
    address public immutable treasury;
    uint256 public immutable roundId;
    uint256 public immutable claimPrice;
    uint64 public immutable startDuration;
    uint64 public immutable extensionDuration;
    uint64 public immutable rugDuration;
    uint64 public immutable hardCapDuration;

    bytes32[4] public factionSymbols;
    uint64 public startedAt;
    uint64 public deadline;
    uint64 public hardEnd;
    uint64 public lastClaimAt;
    uint64 public settledAt;
    bool public cancelled;
    bool public settled;
    bool private locked;

    address public holder;
    uint8 public holderFaction = NO_FACTION;
    uint8 public winningFaction = NO_FACTION;
    uint256 public acceptedClaims;
    uint256 public pot;
    uint256 public holderPool;
    uint256 public factionPool;
    uint256 public nextRoundPool;
    uint256 public protocolPool;

    mapping(address => uint8) private selectedFactionPlusOne;
    mapping(address => uint256) public paid;
    mapping(address => uint256) public controlTime;
    mapping(uint8 => uint256) public factionAirtime;
    mapping(address => bool) public holderRewardClaimed;
    mapping(address => bool) public factionRewardClaimed;
    mapping(address => bool) public refundClaimed;

    event RoundConfigured(
        uint256 indexed roundId,
        address indexed paymentToken,
        uint256 claimPrice,
        uint64 startDuration,
        uint64 extensionDuration,
        uint64 rugDuration,
        uint64 hardCapDuration,
        bytes32[4] factionSymbols
    );
    event RoundStarted(
        uint256 indexed roundId,
        uint64 startedAt,
        uint64 deadline,
        uint64 hardEnd,
        uint256 seedPot
    );
    event FactionJoined(uint256 indexed roundId, address indexed player, uint8 faction);
    event BellClaimed(
        uint256 indexed roundId,
        uint256 indexed sequence,
        address indexed player,
        uint8 faction,
        address previousHolder,
        uint8 previousFaction,
        uint256 fee,
        uint64 acceptedAt,
        uint64 deadline,
        uint256 pot,
        bool rugZone
    );
    event ControlCredited(
        uint256 indexed roundId,
        address indexed player,
        uint8 indexed faction,
        uint64 intervalStart,
        uint64 intervalEnd,
        uint256 duration
    );
    event RugZoneObserved(uint256 indexed roundId, uint64 observedAt, uint64 deadline);
    event SettlementStarted(uint256 indexed roundId, uint64 timestamp);
    event RoundSettled(
        uint256 indexed roundId,
        address indexed finalHolder,
        uint8 indexed winningFaction,
        uint256 grossPot,
        uint256 holderPool,
        uint256 factionPool,
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
    error InvalidFaction();
    error AlreadyJoined();
    error NotJoined();
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
        address operator_,
        address treasury_,
        uint256 roundId_,
        uint256 claimPrice_,
        uint64 startDuration_,
        uint64 extensionDuration_,
        uint64 rugDuration_,
        uint64 hardCapDuration_,
        bytes32[4] memory factionSymbols_
    ) {
        if (
            address(paymentToken_) == address(0) || operator_ == address(0)
                || treasury_ == address(0) || claimPrice_ == 0 || startDuration_ == 0
                || extensionDuration_ == 0 || rugDuration_ == 0
                || rugDuration_ >= startDuration_ || hardCapDuration_ < startDuration_
        ) revert InvalidConfiguration();

        paymentToken = paymentToken_;
        operator = operator_;
        treasury = treasury_;
        roundId = roundId_;
        claimPrice = claimPrice_;
        startDuration = startDuration_;
        extensionDuration = extensionDuration_;
        rugDuration = rugDuration_;
        hardCapDuration = hardCapDuration_;
        factionSymbols = factionSymbols_;

        emit RoundConfigured(
            roundId_,
            address(paymentToken_),
            claimPrice_,
            startDuration_,
            extensionDuration_,
            rugDuration_,
            hardCapDuration_,
            factionSymbols_
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

    function factionOf(address player) public view returns (uint8) {
        uint8 encoded = selectedFactionPlusOne[player];
        if (encoded == 0) return NO_FACTION;
        return encoded - 1;
    }

    function start(uint256 seedPot) external onlyOperator nonReentrant {
        Phase phase = currentPhase();
        if (phase != Phase.Scheduled) revert InvalidPhase(Phase.Scheduled, phase);

        uint64 now64 = uint64(block.timestamp);
        startedAt = now64;
        deadline = now64 + startDuration;
        hardEnd = now64 + hardCapDuration;
        if (seedPot != 0) {
            _pull(operator, seedPot);
            pot = seedPot;
        }

        emit RoundStarted(roundId, now64, deadline, hardEnd, seedPot);
    }

    function joinFaction(uint8 faction) external {
        Phase phase = currentPhase();
        if (phase != Phase.Scheduled && phase != Phase.Live && phase != Phase.Rug) {
            revert InvalidPhase(Phase.Live, phase);
        }
        if (faction >= factionSymbols.length) revert InvalidFaction();
        if (selectedFactionPlusOne[msg.sender] != 0) revert AlreadyJoined();
        selectedFactionPlusOne[msg.sender] = faction + 1;
        emit FactionJoined(roundId, msg.sender, faction);
    }

    function claimBell() external nonReentrant {
        Phase beforeClaim = currentPhase();
        if (beforeClaim != Phase.Live && beforeClaim != Phase.Rug) {
            revert InvalidPhase(Phase.Live, beforeClaim);
        }
        uint8 faction = factionOf(msg.sender);
        if (faction == NO_FACTION) revert NotJoined();
        if (msg.sender == holder) revert CurrentHolder();
        address previousHolder = holder;
        uint8 previousFaction = holderFaction;
        _accrueAirtime(uint64(block.timestamp));
        _pull(msg.sender, claimPrice);
        paid[msg.sender] += claimPrice;
        pot += claimPrice;
        holder = msg.sender;
        holderFaction = faction;
        lastClaimAt = uint64(block.timestamp);
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
            faction,
            previousHolder,
            previousFaction,
            claimPrice,
            uint64(block.timestamp),
            deadline,
            pot,
            beforeClaim == Phase.Rug
        );
    }

    function finalize() external {
        Phase phase = currentPhase();
        if (phase != Phase.Finalizing) {
            revert InvalidPhase(Phase.Finalizing, phase);
        }
        emit SettlementStarted(roundId, uint64(block.timestamp));
        _accrueAirtime(deadline < hardEnd ? deadline : hardEnd);

        winningFaction = _leadingFaction();
        holderPool = (pot * HOLDER_BPS) / BPS;
        factionPool = (pot * FACTION_BPS) / BPS;
        nextRoundPool = (pot * NEXT_ROUND_BPS) / BPS;
        protocolPool = pot - holderPool - factionPool - nextRoundPool;
        settled = true;
        settledAt = uint64(block.timestamp);

        emit RoundSettled(
            roundId,
            holder,
            winningFaction,
            pot,
            holderPool,
            factionPool,
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

    function claimFactionReward() external nonReentrant {
        if (!settled) revert InvalidPhase(Phase.Settled, currentPhase());
        if (
            factionOf(msg.sender) != winningFaction || factionRewardClaimed[msg.sender]
                || controlTime[msg.sender] == 0
        ) revert NothingToClaim();

        factionRewardClaimed[msg.sender] = true;
        uint256 amount =
            (factionPool * controlTime[msg.sender]) / factionAirtime[winningFaction];
        _push(msg.sender, amount);
        emit RewardClaimed(roundId, msg.sender, "FACTION_AIRTIME", amount);
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

    function transferNextRoundSeed(address recipient)
        external
        onlyOperator
        nonReentrant
    {
        if (!settled || recipient == address(0)) revert Unauthorized();
        uint256 amount = nextRoundPool;
        if (amount == 0) revert NothingToClaim();
        nextRoundPool = 0;
        _push(recipient, amount);
        emit NextRoundSeedTransferred(roundId, recipient, amount);
    }

    function payoutSum() external view returns (uint256) {
        return holderPool + factionPool + nextRoundPool + protocolPool;
    }

    function _accrueAirtime(uint64 until) internal {
        if (holder == address(0) || until <= lastClaimAt) return;
        uint256 duration = until - lastClaimAt;
        controlTime[holder] += duration;
        factionAirtime[holderFaction] += duration;
        emit ControlCredited(
            roundId, holder, holderFaction, lastClaimAt, until, duration
        );
    }

    function _leadingFaction() internal view returns (uint8 leader) {
        uint256 best;
        for (uint8 faction = 0; faction < factionSymbols.length; faction++) {
            uint256 score = factionAirtime[faction];
            if (score > best) {
                best = score;
                leader = faction;
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
