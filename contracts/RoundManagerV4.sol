// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "./interfaces/IERC20.sol";
import { IStockSwapAdapter } from "./interfaces/IStockSwapAdapter.sol";
import { PaymentRouter } from "./PaymentRouter.sol";
import { LifetimePointsVault } from "./LifetimePointsVault.sol";
import { LastBellRoundV4 } from "./LastBellRoundV4.sol";

contract RoundManagerV4 {
    IERC20 public immutable paymentToken;
    IStockSwapAdapter public immutable swapAdapter;
    PaymentRouter public immutable paymentRouter;
    LifetimePointsVault public immutable lifetimeVault;
    address public immutable treasury;
    address public admin;
    address public keeper;
    LastBellRoundV4 public activeRound;
    LastBellRoundV4 public preparedRound;
    uint256 public latestRoundId;
    mapping(uint256 => address) public roundById;

    address[4] public seedTokens;
    uint256[4] public seedAmounts;
    address[4] private preparedTokens;

    event RoundPrepared(uint256 indexed roundId, address indexed round);
    event RoundActivated(
        uint256 indexed roundId, address indexed round, uint256[4] seed
    );
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
        if (!paymentToken_.approve(address(swapAdapter_), type(uint256).max)) {
            revert TransferFailed();
        }
    }

    function setKeeper(address nextKeeper) external onlyAdmin {
        if (nextKeeper == address(0)) revert Unauthorized();
        keeper = nextKeeper;
    }

    function transferAdmin(address nextAdmin) external onlyAdmin {
        if (nextAdmin == address(0)) revert Unauthorized();
        admin = nextAdmin;
    }

    function prepareRound(
        LastBellRoundV4.RoundSettings calldata settings,
        LastBellRoundV4.TickerConfig[4] calldata tickers
    ) external onlyKeeper returns (LastBellRoundV4 round) {
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
        LastBellRoundV4.TickerConfig[4] memory configs = tickers;
        round = new LastBellRoundV4(
            paymentToken,
            paymentRouter,
            swapAdapter,
            lifetimeVault,
            address(this),
            treasury,
            settings,
            configs
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

    function activatePrepared(
        uint256[4] calldata sellMinimums,
        uint256[4] calldata buyMinimums,
        uint64 quoteDeadline
    ) external onlyKeeper returns (LastBellRoundV4 next) {
        next = preparedRound;
        if (address(next) == address(0)) revert InvalidTransition();
        uint256[4] memory activationSeed =
            _prepareSeed(sellMinimums, buyMinimums, quoteDeadline);
        for (uint8 i; i < 4; i++) {
            if (
                activationSeed[i] != 0
                    && !IERC20(preparedTokens[i])
                        .transfer(address(next), activationSeed[i])
            ) revert TransferFailed();
        }
        lifetimeVault.openRound(next.roundId(), address(next));
        next.start(activationSeed);
        activeRound = next;
        preparedRound = LastBellRoundV4(address(0));
        seedAmounts = [uint256(0), uint256(0), uint256(0), uint256(0)];
        seedTokens = preparedTokens;
        emit RoundActivated(next.roundId(), address(next), activationSeed);
    }

    function finalizeActive() external onlyKeeper {
        LastBellRoundV4 round = activeRound;
        if (address(round) == address(0)) revert InvalidTransition();
        round.finalize();
        seedAmounts = round.transferNextRoundSeed(address(this));
        for (uint8 i; i < 4; i++) {
            (,, seedTokens[i]) = round.tickerConfigs(i);
        }
        emit ActiveRoundFinalized(round.roundId(), address(round));
    }

    function cancelActive(bytes32 reason) external onlyKeeper {
        LastBellRoundV4 round = activeRound;
        if (address(round) == address(0)) revert InvalidTransition();
        round.cancel(reason);
        round.recoverCancelledSeed(address(this));
        for (uint8 i; i < 4; i++) {
            (,, seedTokens[i]) = round.tickerConfigs(i);
            seedAmounts[i] = IERC20(seedTokens[i]).balanceOf(address(this));
        }
        emit ActiveRoundCancelled(round.roundId(), address(round), reason);
    }

    function _prepareSeed(
        uint256[4] calldata sellMinimums,
        uint256[4] calldata buyMinimums,
        uint64 quoteDeadline
    ) internal returns (uint256[4] memory result) {
        bool hasSeed;
        bool sameRoster = true;
        for (uint8 i; i < 4; i++) {
            if (seedAmounts[i] != 0) hasSeed = true;
            if (seedTokens[i] != preparedTokens[i]) sameRoster = false;
        }
        if (!hasSeed) return result;
        if (sameRoster) return seedAmounts;
        uint256 usdgBefore = paymentToken.balanceOf(address(this));
        for (uint8 i; i < 4; i++) {
            uint256 amount = seedAmounts[i];
            if (amount == 0) continue;
            if (!IERC20(seedTokens[i]).approve(address(swapAdapter), amount)) {
                revert TransferFailed();
            }
            swapAdapter.swapStockForUsdg(
                seedTokens[i], amount, sellMinimums[i], quoteDeadline, address(this)
            );
        }
        uint256 proceeds = paymentToken.balanceOf(address(this)) - usdgBefore;
        uint256 each = proceeds / 4;
        for (uint8 i; i < 4; i++) {
            uint256 amountIn = i == 3 ? proceeds - each * 3 : each;
            result[i] = swapAdapter.swapUsdgForStock(
                preparedTokens[i],
                amountIn,
                buyMinimums[i],
                quoteDeadline,
                address(this)
            );
        }
    }
}
