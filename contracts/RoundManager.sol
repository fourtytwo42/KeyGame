// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";
import { IMarketDataVerifier } from "./interfaces/IMarketDataVerifier.sol";
import { LastBellRound } from "./LastBellRound.sol";
import { PaymentRouter } from "./PaymentRouter.sol";

/// @notice Serializes preparation, activation, settlement, and seed rollover.
contract RoundManager {
    IERC20 public immutable paymentToken;
    IMarketDataVerifier public immutable marketVerifier;
    PaymentRouter public immutable paymentRouter;
    address public immutable treasury;
    address public admin;
    address public keeper;
    LastBellRound public activeRound;
    LastBellRound public preparedRound;
    uint256 public latestRoundId;
    mapping(uint256 => address) public roundById;

    event KeeperChanged(address indexed keeper);
    event AdminTransferred(address indexed previousAdmin, address indexed nextAdmin);
    event RoundPrepared(uint256 indexed roundId, address indexed round);
    event RoundActivated(uint256 indexed roundId, address indexed round, uint256 seed);
    event ActiveRoundFinalized(uint256 indexed roundId, address indexed round);
    event ActiveRoundCancelled(
        uint256 indexed roundId, address indexed round, bytes32 reason
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
        IMarketDataVerifier marketVerifier_,
        address admin_,
        address keeper_,
        address treasury_
    ) {
        if (
            address(paymentToken_) == address(0) || admin_ == address(0)
                || keeper_ == address(0) || treasury_ == address(0)
        ) revert Unauthorized();
        paymentToken = paymentToken_;
        marketVerifier = marketVerifier_;
        admin = admin_;
        keeper = keeper_;
        treasury = treasury_;
        paymentRouter = new PaymentRouter(paymentToken_, address(this));
        if (!paymentToken_.approve(address(paymentRouter), type(uint256).max)) {
            revert TransferFailed();
        }
    }

    function setKeeper(address nextKeeper) external onlyAdmin {
        if (nextKeeper == address(0)) revert Unauthorized();
        keeper = nextKeeper;
        emit KeeperChanged(nextKeeper);
    }

    function transferAdmin(address nextAdmin) external onlyAdmin {
        if (nextAdmin == address(0)) revert Unauthorized();
        emit AdminTransferred(admin, nextAdmin);
        admin = nextAdmin;
    }

    function prepareRound(
        LastBellRound.RoundSettings calldata settings,
        LastBellRound.TickerConfig[4] calldata tickers
    ) external onlyKeeper returns (LastBellRound round) {
        if (address(preparedRound) != address(0) || settings.roundId <= latestRoundId) {
            revert InvalidTransition();
        }
        if (address(activeRound) != address(0)) {
            LastBellRound.Phase phase = activeRound.currentPhase();
            if (
                phase != LastBellRound.Phase.Settled
                    && phase != LastBellRound.Phase.Cancelled
            ) revert InvalidTransition();
        }
        round = new LastBellRound(
            paymentToken,
            paymentRouter,
            marketVerifier,
            address(this),
            treasury,
            settings,
            tickers
        );
        marketVerifier.authorizeCaller(address(round));
        paymentRouter.setRoundAuthorization(address(round), true);
        preparedRound = round;
        latestRoundId = settings.roundId;
        roundById[settings.roundId] = address(round);
        emit RoundPrepared(settings.roundId, address(round));
    }

    function activatePrepared(bytes[4] calldata openingReports)
        external
        onlyKeeper
        returns (LastBellRound next)
    {
        next = preparedRound;
        if (address(next) == address(0)) revert InvalidTransition();

        if (address(activeRound) != address(0)) {
            LastBellRound.Phase phase = activeRound.currentPhase();
            if (phase == LastBellRound.Phase.Settled) {
                activeRound.transferNextRoundSeed(address(this));
            } else if (phase != LastBellRound.Phase.Cancelled) {
                revert InvalidTransition();
            }
        }

        uint256 seed = paymentToken.balanceOf(address(this));
        next.start(seed, openingReports);
        activeRound = next;
        preparedRound = LastBellRound(address(0));
        emit RoundActivated(next.roundId(), address(next), seed);
    }

    function finalizeActive() external onlyKeeper {
        LastBellRound round = activeRound;
        if (address(round) == address(0)) revert InvalidTransition();
        round.finalize();
        emit ActiveRoundFinalized(round.roundId(), address(round));
    }

    function cancelActive(bytes32 reason) external onlyKeeper {
        LastBellRound round = activeRound;
        if (address(round) == address(0)) revert InvalidTransition();
        round.cancel(reason);
        emit ActiveRoundCancelled(round.roundId(), address(round), reason);
    }
}
