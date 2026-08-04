// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";
import { IStockSwapAdapter } from "./interfaces/IStockSwapAdapter.sol";
import { PaymentRouter } from "./PaymentRouter.sol";
import { LifetimePointsVault } from "./LifetimePointsVault.sol";
import { LastBellRoundV4 } from "./LastBellRoundV4.sol";
import { RoundFactoryV5 } from "./RoundFactoryV5.sol";

contract RoundManagerV4 {
    bytes32 private constant MANAGER_ADMIN_ROLE = keccak256("MANAGER_ADMIN");
    bytes32 private constant TREASURY_ROLE = keccak256("TREASURY");
    IERC20 public immutable paymentToken;
    IStockSwapAdapter public immutable swapAdapter;
    PaymentRouter public immutable paymentRouter;
    LifetimePointsVault public immutable lifetimeVault;
    RoundFactoryV5 public immutable roundFactory;
    address public treasury;
    address public pendingTreasury;
    address public admin;
    address public pendingAdmin;
    address public keeper;
    LastBellRoundV4 public activeRound;
    LastBellRoundV4 public preparedRound;
    uint256 public latestRoundId;
    mapping(uint256 => address) public roundById;

    address[4] public seedTokens;
    uint256[4] public seedAmounts;
    uint256 public seedUsdg;
    address[4] private preparedTokens;

    event RoundPrepared(uint256 indexed roundId, address indexed round);
    event PreparedRoundDiscarded(
        uint256 indexed roundId, address indexed round, bytes32 reason
    );
    event RoundActivated(
        uint256 indexed roundId,
        address indexed round,
        uint256[4] stockSeed,
        uint256 usdgSeed
    );
    event ActiveRoundFinalized(uint256 indexed roundId, address indexed round);
    event ActiveRoundCancelled(
        uint256 indexed roundId, address indexed round, bytes32 reason
    );
    /// @dev action: 0 proposed, 1 cancelled, 2 accepted.
    event RoleTransfer(
        bytes32 indexed role,
        uint8 indexed action,
        address indexed previousAuthority,
        address nextAuthority
    );
    event KeeperChanged(address indexed previousKeeper, address indexed nextKeeper);
    event LifecycleAuthority(
        bytes4 indexed selector, address indexed actor, bool administrator
    );

    error Unauthorized();
    error InvalidTransition();
    error TransferFailed();

    modifier onlyKeeper() {
        if (msg.sender != keeper && msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    constructor(
        IERC20 paymentToken_,
        IStockSwapAdapter swapAdapter_,
        address admin_,
        address keeper_,
        address treasury_
    ) {
        if (
            address(paymentToken_) == address(0) || address(swapAdapter_) == address(0)
                || admin_ == address(0) || keeper_ == address(0)
                || treasury_ == address(0)
        ) revert Unauthorized();
        paymentToken = paymentToken_;
        swapAdapter = swapAdapter_;
        admin = admin_;
        keeper = keeper_;
        treasury = treasury_;
        paymentRouter = new PaymentRouter(paymentToken_, address(this));
        lifetimeVault = new LifetimePointsVault(address(this));
        roundFactory = new RoundFactoryV5();
        lifetimeVault.registerRewardToken(address(paymentToken_));
        if (!paymentToken_.approve(address(swapAdapter_), type(uint256).max)) {
            revert TransferFailed();
        }
    }

    function setKeeper(address nextKeeper) external onlyAdmin {
        if (nextKeeper == address(0)) revert Unauthorized();
        address previousKeeper = keeper;
        keeper = nextKeeper;
        emit KeeperChanged(previousKeeper, nextKeeper);
    }

    function proposeAdmin(address nextAdmin) external onlyAdmin {
        if (nextAdmin == address(0)) revert Unauthorized();
        pendingAdmin = nextAdmin;
        emit RoleTransfer(MANAGER_ADMIN_ROLE, 0, admin, nextAdmin);
    }

    function cancelAdminTransfer() external onlyAdmin {
        address cancelledPendingAdmin = pendingAdmin;
        if (cancelledPendingAdmin == address(0)) revert InvalidTransition();
        pendingAdmin = address(0);
        emit RoleTransfer(MANAGER_ADMIN_ROLE, 1, admin, cancelledPendingAdmin);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert Unauthorized();
        address previousAdmin = admin;
        admin = msg.sender;
        pendingAdmin = address(0);
        emit RoleTransfer(MANAGER_ADMIN_ROLE, 2, previousAdmin, msg.sender);
    }

    function proposeTreasury(address nextTreasury) external onlyAdmin {
        if (nextTreasury == address(0)) revert Unauthorized();
        pendingTreasury = nextTreasury;
        emit RoleTransfer(TREASURY_ROLE, 0, treasury, nextTreasury);
    }

    function cancelTreasuryTransfer() external onlyAdmin {
        address cancelledPendingTreasury = pendingTreasury;
        if (cancelledPendingTreasury == address(0)) revert InvalidTransition();
        pendingTreasury = address(0);
        emit RoleTransfer(TREASURY_ROLE, 1, treasury, cancelledPendingTreasury);
    }

    function acceptTreasury() external {
        if (msg.sender != pendingTreasury) revert Unauthorized();
        address previousTreasury = treasury;
        treasury = msg.sender;
        pendingTreasury = address(0);
        emit RoleTransfer(TREASURY_ROLE, 2, previousTreasury, msg.sender);
    }

    /// @notice Production market configuration is locked while a round can
    /// accept contributions. Settled/cancelled rounds are safe configuration
    /// windows before the next roster is prepared.
    function marketConfigurationAllowed() external view returns (bool) {
        if (address(preparedRound) != address(0)) return false;
        LastBellRoundV4 round = activeRound;
        if (address(round) == address(0)) return true;
        LastBellRoundV4.Phase phase = round.currentPhase();
        return phase == LastBellRoundV4.Phase.Settled
            || phase == LastBellRoundV4.Phase.Cancelled;
    }

    function prepareRound(
        LastBellRoundV4.RoundSettings calldata settings,
        LastBellRoundV4.TickerConfig[4] calldata tickers
    ) external onlyKeeper returns (LastBellRoundV4 round) {
        _emitLifecycleAuthority();
        if (address(preparedRound) != address(0) || settings.roundId <= latestRoundId) {
            revert InvalidTransition();
        }
        if (address(activeRound) != address(0)) {
            LastBellRoundV4.Phase phase = activeRound.currentPhase();
            if (
                phase != LastBellRoundV4.Phase.Settled
                    && phase != LastBellRoundV4.Phase.Cancelled
            ) revert InvalidTransition();
        }
        for (uint8 i; i < 4; i++) {
            if (
                tickers[i].token == address(0)
                    || tickers[i].token == address(paymentToken)
                    || !swapAdapter.isStockSupported(tickers[i].token)
            ) revert InvalidTransition();
            for (uint8 prior; prior < i; prior++) {
                if (tickers[prior].token == tickers[i].token) {
                    revert InvalidTransition();
                }
            }
        }
        round = roundFactory.deployRound(
            paymentToken,
            paymentRouter,
            swapAdapter,
            lifetimeVault,
            treasury,
            settings,
            tickers
        );
        for (uint8 i; i < 4; i++) {
            preparedTokens[i] = tickers[i].token;
            lifetimeVault.registerRewardToken(tickers[i].token);
        }
        paymentRouter.setRoundAuthorization(address(round), true);
        preparedRound = round;
        latestRoundId = settings.roundId;
        roundById[settings.roundId] = address(round);
        emit RoundPrepared(settings.roundId, address(round));
    }

    /// @notice Discards an empty, unactivated round when its frozen roster no
    /// longer passes activation checks. The abandoned contract never receives
    /// seed assets and cannot accept contributions because it was not started.
    function discardPrepared(bytes32 reason) external onlyKeeper {
        _emitLifecycleAuthority();
        LastBellRoundV4 round = preparedRound;
        if (address(round) == address(0) || round.initialized()) {
            revert InvalidTransition();
        }
        preparedRound = LastBellRoundV4(address(0));
        paymentRouter.setRoundAuthorization(address(round), false);
        emit PreparedRoundDiscarded(round.roundId(), address(round), reason);
    }

    function activatePrepared(
        uint256[4] calldata sellMinimums,
        uint256[4] calldata buyMinimums,
        uint64 quoteDeadline
    ) external onlyKeeper returns (LastBellRoundV4 next) {
        _emitLifecycleAuthority();
        next = preparedRound;
        if (address(next) == address(0)) revert InvalidTransition();
        (uint256[4] memory activationSeed, uint256 activationUsdg) =
            _prepareSeed(sellMinimums, buyMinimums, quoteDeadline);
        for (uint8 i; i < 4; i++) {
            if (
                activationSeed[i] != 0
                    && !IERC20(preparedTokens[i])
                        .transfer(address(next), activationSeed[i])
            ) revert TransferFailed();
        }
        if (
            activationUsdg != 0
                && !paymentToken.transfer(address(next), activationUsdg)
        ) revert TransferFailed();
        lifetimeVault.openRound(next.roundId(), address(next));
        next.start(activationSeed, activationUsdg);
        activeRound = next;
        preparedRound = LastBellRoundV4(address(0));
        seedAmounts = [uint256(0), uint256(0), uint256(0), uint256(0)];
        seedUsdg = 0;
        seedTokens = preparedTokens;
        emit RoundActivated(
            next.roundId(), address(next), activationSeed, activationUsdg
        );
    }

    function finalizeActive() external onlyKeeper {
        _emitLifecycleAuthority();
        LastBellRoundV4 round = activeRound;
        if (address(round) == address(0)) revert InvalidTransition();
        round.finalize();
        (seedAmounts, seedUsdg) = round.transferNextRoundSeed(address(this));
        for (uint8 i; i < 4; i++) {
            (,, seedTokens[i]) = round.tickerConfigs(i);
        }
        emit ActiveRoundFinalized(round.roundId(), address(round));
    }

    function cancelActive(bytes32 reason) external onlyKeeper {
        _emitLifecycleAuthority();
        LastBellRoundV4 round = activeRound;
        if (address(round) == address(0)) revert InvalidTransition();
        round.cancel(reason);
        (seedAmounts, seedUsdg) = round.recoverCancelledSeed(address(this));
        for (uint8 i; i < 4; i++) {
            (,, seedTokens[i]) = round.tickerConfigs(i);
        }
        emit ActiveRoundCancelled(round.roundId(), address(round), reason);
    }

    function _emitLifecycleAuthority() private {
        emit LifecycleAuthority(msg.sig, msg.sender, msg.sender == admin);
    }

    function _prepareSeed(
        uint256[4] calldata sellMinimums,
        uint256[4] calldata buyMinimums,
        uint64 quoteDeadline
    ) internal returns (uint256[4] memory result, uint256 residualUsdg) {
        bool hasSeed;
        bool sameRoster = true;
        for (uint8 i; i < 4; i++) {
            if (seedAmounts[i] != 0) hasSeed = true;
            if (seedTokens[i] != preparedTokens[i]) sameRoster = false;
        }
        if (seedUsdg != 0) hasSeed = true;
        if (!hasSeed) return (result, 0);
        if (sameRoster) return (seedAmounts, seedUsdg);
        uint256 usdgBefore = paymentToken.balanceOf(address(this));
        for (uint8 i; i < 4; i++) {
            uint256 amount = seedAmounts[i];
            if (amount == 0) continue;
            if (!IERC20(seedTokens[i]).approve(address(swapAdapter), amount)) {
                revert TransferFailed();
            }
            uint256 beforePayment = paymentToken.balanceOf(address(this));
            (uint256 consumed, uint256 output) = swapAdapter.swapStockForUsdg(
                seedTokens[i], amount, sellMinimums[i], quoteDeadline, address(this)
            );
            if (
                consumed != amount
                    || paymentToken.balanceOf(address(this)) - beforePayment != output
            ) revert TransferFailed();
        }
        uint256 proceeds = paymentToken.balanceOf(address(this)) - usdgBefore + seedUsdg;
        uint256 each = proceeds / 4;
        for (uint8 i; i < 4; i++) {
            uint256 amountIn = i == 3 ? proceeds - each * 3 : each;
            uint256 beforeBalance = IERC20(preparedTokens[i]).balanceOf(address(this));
            (uint256 consumed, uint256 output) = swapAdapter.swapUsdgForStock(
                preparedTokens[i],
                amountIn,
                buyMinimums[i],
                quoteDeadline,
                address(this)
            );
            if (
                consumed != amountIn
                    || IERC20(preparedTokens[i]).balanceOf(address(this))
                        - beforeBalance != output
            ) revert TransferFailed();
            result[i] = output;
        }
        seedUsdg = 0;
        residualUsdg = 0;
    }
}
