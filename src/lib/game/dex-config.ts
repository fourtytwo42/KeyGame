import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import type { Address, Hex } from "viem";

export const ROBINHOOD_MAINNET_CHAIN_ID = 4663;
export const ROBINHOOD_UNISWAP_V3_FACTORY =
  "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA" as Address;
export const ROBINHOOD_USDG =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
export const TWAP_WINDOW_SECONDS = 600;
export const REQUIRED_HISTORY_SECONDS = 1800;
export const MIN_USDG_DEPTH = 10_000;
export const MAX_QUOTE_IMPACT_BPS = 100;
export const MAX_SPOT_TWAP_DEVIATION_BPS = 100;
export const QUOTE_NOTIONAL_USDG = 1_000;

export type PinnedDexMarket = {
  symbol: string;
  stockToken: Address;
  pool: Address;
  feeTier: number;
};

export const pinnedDexMarkets: readonly PinnedDexMarket[] = [
  {
    symbol: "AAPL",
    stockToken: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    pool: "0x783c9bbb765047cfdd2b84b92b2ca9f11d34b7ed",
    feeTier: 3000,
  },
  {
    symbol: "TSLA",
    stockToken: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d",
    pool: "0xf4acdaeeb7022862a763c9b1b885e11191c889e3",
    feeTier: 3000,
  },
  {
    symbol: "AMZN",
    stockToken: "0x12f190a9F9d7D37a250758b26824B97CE941bF54",
    pool: "0x8ac92da74ab5f3b1d024dc1943ad7e15dc4179ef",
    feeTier: 3000,
  },
  {
    symbol: "SPY",
    stockToken: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
    pool: "0xa43b424bc609495aed4bcd88d654934b510b0ad9",
    feeTier: 3000,
  },
  {
    symbol: "NVDA",
    stockToken: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    pool: "0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3",
    feeTier: 500,
  },
] as const;

export function dexMarketId(market: PinnedDexMarket): Hex {
  return keccak256(
    encodeAbiParameters(
      parseAbiParameters(
        "uint256,address,address,address,address,uint24,uint32",
      ),
      [
        BigInt(ROBINHOOD_MAINNET_CHAIN_ID),
        ROBINHOOD_UNISWAP_V3_FACTORY,
        market.pool,
        market.stockToken,
        ROBINHOOD_USDG,
        market.feeTier,
        TWAP_WINDOW_SECONDS,
      ],
    ),
  );
}

export const pinnedMarketBySymbol = new Map(
  pinnedDexMarkets.map((market) => [market.symbol, market]),
);
