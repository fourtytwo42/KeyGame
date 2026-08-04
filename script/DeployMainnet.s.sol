// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { LastBellRoundV4 } from "../contracts/LastBellRoundV4.sol";
import { IERC20 } from "../contracts/interfaces/IERC20.sol";
import { RewardRouterV4 } from "../contracts/RewardRouterV4.sol";
import { RobinhoodStockSwapAdapter } from "../contracts/RobinhoodStockSwapAdapter.sol";
import { RoundManagerV4 } from "../contracts/RoundManagerV4.sol";
import { ScriptBase } from "./ScriptBase.sol";

/// @notice Complete v4 mainnet deployment path with a compile-time release
/// lock. A dedicated reviewed release commit must change the constant.
contract DeployMainnetV4 is ScriptBase {
    bool private constant MAINNET_BROADCAST_ENABLED = false;
    address private constant FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address private constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    error InternalAssuranceAndReleaseAuthorizationRequired();
    error InvalidInitialRoster();
    error InvalidDeploymentRelationship();

    function run()
        external
        returns (
            RobinhoodStockSwapAdapter adapter,
            RoundManagerV4 manager,
            RewardRouterV4 rewardRouter,
            LastBellRoundV4 round
        )
    {
        if (
            !MAINNET_BROADCAST_ENABLED || block.chainid != 4663
                || !vm.envBool("KEYGAME_MAINNET_V4_BROADCAST")
        ) revert InternalAssuranceAndReleaseAuthorizationRequired();

        address deployer = vm.envAddress("DEPLOYER_ADDRESS");

        vm.startBroadcast(deployer);
        adapter = new RobinhoodStockSwapAdapter(FACTORY, USDG, deployer);
        _configureInitialCatalog(adapter);
        manager =
            new RoundManagerV4(IERC20(USDG), adapter, deployer, deployer, deployer);
        rewardRouter = new RewardRouterV4(manager.lifetimeVault());
        adapter.setConfigurationGuard(address(manager));
        if (
            address(manager.paymentToken()) != USDG
                || address(manager.swapAdapter()) != address(adapter)
                || manager.admin() != deployer || manager.keeper() != deployer
                || manager.treasury() != deployer
                || manager.pendingAdmin() != address(0)
                || manager.pendingTreasury() != address(0)
                || adapter.admin() != deployer
                || address(manager.paymentRouter().paymentToken()) != USDG
                || manager.paymentRouter().operator() != address(manager)
                || manager.lifetimeVault().manager() != address(manager)
                || manager.roundFactory().manager() != address(manager)
                || address(rewardRouter.lifetimeVault())
                    != address(manager.lifetimeVault())
                || adapter.configurationGuard() != address(manager)
        ) revert InvalidDeploymentRelationship();

        LastBellRoundV4.TickerConfig[4] memory tickers;
        for (uint8 i; i < 4; i++) {
            address stock = vm.envAddress(string.concat("INITIAL_STOCK_", _digit(i)));
            bytes32 symbol = vm.envBytes32(string.concat("INITIAL_SYMBOL_", _digit(i)));
            (bytes32 configuredSymbol, bytes32 assetId,,,,, bool enabled) =
                adapter.markets(stock);
            if (!enabled || symbol == bytes32(0) || symbol != configuredSymbol) {
                revert InvalidInitialRoster();
            }
            for (uint8 prior; prior < i; prior++) {
                if (tickers[prior].token == stock) revert InvalidInitialRoster();
            }
            tickers[i] = LastBellRoundV4.TickerConfig({
                symbol: symbol, assetId: assetId, token: stock
            });
        }
        LastBellRoundV4.RoundSettings memory settings = LastBellRoundV4.RoundSettings({
            roundId: vm.envUint("INITIAL_ROUND_ID"),
            startDuration: 300,
            extensionDuration: 2,
            rugDuration: 10,
            hardCapDuration: 600,
            heatTarget: 4_000e6,
            producerPassRequired: false
        });
        round = manager.prepareRound(settings, tickers);
        uint256[4] memory zeroes;
        manager.activatePrepared(zeroes, zeroes, type(uint64).max);
        vm.stopBroadcast();
    }

    function _configureInitialCatalog(RobinhoodStockSwapAdapter adapter) private {
        _configure(
            adapter,
            bytes32("AAPL"),
            0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9,
            0x783C9bbB765047CFdD2b84b92b2Ca9F11D34b7Ed,
            3_000
        );
        _configure(
            adapter,
            bytes32("TSLA"),
            0x322F0929c4625eD5bAd873c95208D54E1c003b2d,
            0xf4ACdAEEB7022862A763C9B1B885e11191c889E3,
            3_000
        );
        _configure(
            adapter,
            bytes32("AMZN"),
            0x12f190a9F9d7D37a250758b26824B97CE941bF54,
            0x8AC92DA74AB5F3b1d024Dc1943Ad7e15Dc4179Ef,
            3_000
        );
        _configure(
            adapter,
            bytes32("SPY"),
            0x117cc2133c37B721F49dE2A7a74833232B3B4C0C,
            0xA43b424Bc609495AED4BCD88d654934b510B0aD9,
            3_000
        );
        _configure(
            adapter,
            bytes32("NVDA"),
            0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC,
            0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3,
            500
        );
    }

    function _configure(
        RobinhoodStockSwapAdapter adapter,
        bytes32 symbol,
        address stock,
        address pool,
        uint24 fee
    ) private {
        adapter.configureMarket(
            symbol,
            keccak256(abi.encode("ROBINHOOD_CANONICAL", stock)),
            stock,
            pool,
            fee,
            1,
            10_000e6
        );
    }

    function _digit(uint8 value) private pure returns (string memory) {
        if (value == 0) return "0";
        if (value == 1) return "1";
        if (value == 2) return "2";
        return "3";
    }
}
