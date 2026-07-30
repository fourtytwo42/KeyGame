import type { RoundConfig, TickerSlot } from "./types";

const address = (suffix: string) =>
  `0x${suffix.padStart(40, "0")}` as `0x${string}`;
const marketId = (suffix: string) =>
  `0x${suffix.padStart(64, "0")}` as `0x${string}`;

export const tickerSlots: TickerSlot[] = [
  {
    id: "NVDA",
    name: "Silicon Casino",
    assetName: "Robinhood NVDA Stock Token",
    color: "#55C6A9",
    secondary: "#183D36",
    tokenAddress: address("11"),
    marketId: marketId("11"),
    volatilityRank: 1,
    realizedMovementBps: 188,
    dailyVolume: 286_400_000,
    openingPrice: 183.42,
    currentPrice: 183.57,
    currentBand: "GREEN",
    multiplierBps: 12_500,
  },
  {
    id: "AAPL",
    name: "Orchard After Dark",
    assetName: "Robinhood AAPL Stock Token",
    color: "#B5A6D8",
    secondary: "#3A3157",
    tokenAddress: address("12"),
    marketId: marketId("12"),
    volatilityRank: 3,
    realizedMovementBps: 121,
    dailyVolume: 68_200_000,
    openingPrice: 214.16,
    currentPrice: 214.17,
    currentBand: "FLAT",
    multiplierBps: 10_000,
  },
  {
    id: "TSLA",
    name: "Hot Seat",
    assetName: "Robinhood TSLA Stock Token",
    color: "#F15D4C",
    secondary: "#5B211B",
    tokenAddress: address("13"),
    marketId: marketId("13"),
    volatilityRank: 2,
    realizedMovementBps: 164,
    dailyVolume: 121_700_000,
    openingPrice: 311.8,
    currentPrice: 311.56,
    currentBand: "RED",
    multiplierBps: 7_500,
  },
  {
    id: "SPY",
    name: "Wide Shot",
    assetName: "Robinhood SPY Stock Token",
    color: "#5261A8",
    secondary: "#242B5D",
    tokenAddress: address("14"),
    marketId: marketId("14"),
    volatilityRank: 4,
    realizedMovementBps: 95,
    dailyVolume: 79_500_000,
    openingPrice: 639.8,
    currentPrice: 639.83,
    currentBand: "FLAT",
    multiplierBps: 10_000,
  },
];

export const roundConfig: RoundConfig = {
  roundId: "4663",
  claimPriceUsd: 1,
  startSeconds: 45,
  extensionSeconds: 2,
  rugZoneSeconds: 10,
  hardCapSeconds: 180,
  marketMode: "DEX",
  marketThresholdBps: 5,
  multipliersBps: { GREEN: 12_500, FLAT: 10_000, RED: 7_500 },
  producerPassRequired: false,
  payoutBps: {
    holder: 5000,
    airtime: 3000,
    nextRound: 1500,
    protocol: 500,
  },
  tickers: tickerSlots,
};

export const sessionApproval = {
  amountUsd: 100,
  refreshBelowUsd: 10,
} as const;

export const demoAddresses = {
  caller: "0x4663B31100000000000000000000000000000001",
  rival: "0x4663B31100000000000000000000000000000002",
  player: "0x4663B31100000000000000000000000000000003",
} as const;

export const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);

export const shortAddress = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;
