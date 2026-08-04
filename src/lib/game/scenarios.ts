import { demoAddresses, roundConfig, tickerSlots } from "./constants";
import type {
  BellHolder,
  ClaimEvent,
  MarketBand,
  RoundState,
  SimulationScenario,
  SimulationScenarioId,
  TickerId,
  TickerScore,
} from "./types";

const reportEpoch = 1_784_724_360;

const holder: BellHolder = {
  address: demoAddresses.caller,
  displayName: "bellboy.eth",
  ticker: "NVDA",
  claimNumber: 38,
  band: "GREEN",
  multiplierBps: 12_500,
  verifiedPrice: 183.57,
  reportTimestamp: reportEpoch,
  producerPass: true,
};

const rival: BellHolder = {
  address: demoAddresses.rival,
  displayName: "chartreuse.ape",
  ticker: "TSLA",
  claimNumber: 37,
  band: "RED",
  multiplierBps: 7_500,
  verifiedPrice: 311.56,
  reportTimestamp: reportEpoch - 4,
  producerPass: false,
};

const tickerScores: TickerScore[] = [
  {
    ticker: "NVDA",
    rawSeconds: 54,
    weightedScore: 67.5,
    lastAcquisitionAt: 151,
    currentBand: "GREEN",
    multiplierBps: 12_500,
  },
  {
    ticker: "AAPL",
    rawSeconds: 41,
    weightedScore: 41,
    lastAcquisitionAt: 133,
    currentBand: "FLAT",
    multiplierBps: 10_000,
  },
  {
    ticker: "TSLA",
    rawSeconds: 49,
    weightedScore: 36.75,
    lastAcquisitionAt: 147,
    currentBand: "RED",
    multiplierBps: 7_500,
  },
  {
    ticker: "SPY",
    rawSeconds: 36,
    weightedScore: 36,
    lastAcquisitionAt: 129,
    currentBand: "FLAT",
    multiplierBps: 10_000,
  },
];

const makeClaim = (
  sequence: number,
  claimant: BellHolder,
  atSeconds: number,
  timeAfterSeconds: number,
  intervalSeconds: number,
  usdgAmount: number,
): ClaimEvent => ({
  id: `claim-${sequence}`,
  sequence,
  atSeconds,
  claimant: { ...claimant, claimNumber: sequence },
  previousTicker: sequence === 38 ? "TSLA" : "NVDA",
  feeUsd: usdgAmount,
  phase: timeAfterSeconds <= 10 ? "rug" : "live",
  contractVersion: "saved-bell-v5-market-pot",
  accepted: true,
  potAfterUsd: 50 + usdgAmount,
  timeAfterSeconds,
  verifiedPrice: claimant.verifiedPrice,
  reportTimestamp: claimant.reportTimestamp,
  marketBand: claimant.band,
  multiplierBps: claimant.multiplierBps,
  intervalSeconds,
  weightedPoints: (intervalSeconds * claimant.multiplierBps) / 10_000,
  usdgAmount,
  usdgConsumed: usdgAmount,
  residualUsdg: 0,
  pointsAwarded: (usdgAmount * claimant.multiplierBps) / 10_000,
  stockReceived: usdgAmount / claimant.verifiedPrice,
  producerPass: claimant.producerPass,
});

const claims: ClaimEvent[] = [
  makeClaim(35, { ...holder, displayName: "green.candle" }, 136, 18, 8, 10),
  makeClaim(36, { ...rival, displayName: "cookinwithgas" }, 144, 12, 3, 2),
  makeClaim(37, rival, 147, 9, 4, 5),
  makeClaim(38, holder, 151, 5, 0, 10),
];

const baseState: RoundState = {
  phase: "live",
  marketMode: "FLAT",
  broadcastLabel: "VOLUME CHECK",
  producerPassRequired: false,
  timeLeftSeconds: 21,
  elapsedSeconds: 128,
  hardTimeLeftSeconds: 52,
  potUsd: 89,
  holder,
  tickerScores,
  claims,
  freshness: "live",
  updatedAt: "2026-07-28T20:46:03.000Z",
  contractVersion: "saved-bell-v5-market-pot",
};

const stateFor = (
  phase: RoundState["phase"],
  overrides: Partial<RoundState> = {},
): RoundState => ({ ...baseState, phase, ...overrides });

export function tickerById(id: string) {
  const configured = tickerSlots.find((ticker) => ticker.id === id);
  if (configured) return configured;
  const palette = [
    ["#ff5f5f", "#551f34"],
    ["#70d6ff", "#173e56"],
    ["#ffd166", "#5b4313"],
    ["#b8f2a1", "#244a26"],
  ] as const;
  const slot =
    [...id].reduce((total, character) => total + character.charCodeAt(0), 0) %
    palette.length;
  return {
    ...tickerSlots[slot],
    id,
    name: id,
    assetName: `${id} Stock Token`,
    color: palette[slot][0],
    secondary: palette[slot][1],
  };
}

const bandState = (band: MarketBand, ticker: TickerId): RoundState => {
  const slot = tickerById(ticker);
  const multiplierBps = roundConfig.multipliersBps[band];
  return stateFor("live", {
    holder: {
      ...holder,
      ticker,
      band,
      multiplierBps,
      verifiedPrice: slot.currentPrice,
    },
  });
};

export const scenarios: Record<SimulationScenarioId, SimulationScenario> = {
  entry: {
    id: "entry",
    label: "Entry desk",
    description:
      "Pick a stock and choose any contribution amount. The first accepted contribution starts the timer.",
    state: stateFor("entry", {
      timeLeftSeconds: 300,
      elapsedSeconds: 0,
      hardTimeLeftSeconds: 600,
      potUsd: 50,
      holder: null,
      claims: [],
      tickerScores: tickerScores.map((score) => ({
        ...score,
        rawSeconds: 0,
        weightedScore: 0,
        lastAcquisitionAt: 0,
      })),
    }),
  },
  live: {
    id: "live",
    label: "Live transmission",
    description:
      "Each accepted contribution buys the selected Stock Token, steals the bell, and resets the clock to five minutes.",
    state: baseState,
  },
  "green-switch": {
    id: "green-switch",
    label: "Green switch",
    description: "The locked holder interval is scoring at 1.25×.",
    state: bandState("GREEN", "NVDA"),
  },
  "red-switch": {
    id: "red-switch",
    label: "Red switch",
    description: "The ticker is on air, but this interval scores at 0.75×.",
    state: bandState("RED", "TSLA"),
  },
  "ticker-raid": {
    id: "ticker-raid",
    label: "Ticker raid",
    description:
      "Producer Pass holders are hammering one ticker onto the tape.",
    state: stateFor("live", { holder: { ...holder, producerPass: true } }),
  },
  rug: {
    id: "rug",
    label: "Rug Zone",
    description:
      "Claims still steal the bell and reset the clock, capped by the ten-minute hard stop.",
    state: stateFor("rug", {
      timeLeftSeconds: 7,
      elapsedSeconds: 151,
      hardTimeLeftSeconds: 29,
    }),
  },
  finalizing: {
    id: "finalizing",
    label: "Checking the tape",
    description: "The clock is frozen while the chain settles both winners.",
    state: stateFor("finalizing", {
      timeLeftSeconds: 0,
      elapsedSeconds: 158,
      hardTimeLeftSeconds: 22,
    }),
  },
  settled: {
    id: "settled",
    label: "Final transmission",
    description: "Final caller first. Closing Print contributors second.",
    state: stateFor("settled", {
      timeLeftSeconds: 0,
      elapsedSeconds: 158,
      hardTimeLeftSeconds: 22,
      winningTicker: "NVDA",
      pools: {
        holderUsd: 44.5,
        airtimeUsd: 26.7,
        nextRoundUsd: 13.35,
        protocolUsd: 4.45,
      },
      settlementTx:
        "0x4663ba11000000000000000000000000000000000000000000000000004663",
    }),
  },
  flat: {
    id: "flat",
    label: "Flat fallback",
    description:
      "Streams were incomplete before start. Every ticker scores 1×.",
    state: stateFor("live", {
      marketMode: "FLAT",
      broadcastLabel: "VOLUME CHECK",
      tickerScores: tickerScores.map((score) => ({
        ...score,
        currentBand: "FLAT",
        multiplierBps: 10_000,
      })),
    }),
  },
  "stale-data": {
    id: "stale-data",
    label: "Stale report",
    description:
      "An unsafe or unavailable quote is rejected before the selected contribution can move.",
    state: stateFor("live", { freshness: "delayed" }),
  },
  "special-round": {
    id: "special-round",
    label: "Producer Pass",
    description:
      "Holding any roster Stock Token unlocks this special broadcast.",
    state: stateFor("live", { producerPassRequired: true }),
  },
  "dead-air": {
    id: "dead-air",
    label: "Dead air",
    description: "All streams are unavailable. Transactions are disabled.",
    state: stateFor("live", { freshness: "offline", timeLeftSeconds: 18 }),
  },
};

export const scenarioIds = Object.keys(scenarios) as SimulationScenarioId[];

export const getScenario = (id?: string): SimulationScenario =>
  scenarios[(id as SimulationScenarioId) || "live"] ?? scenarios.live;
