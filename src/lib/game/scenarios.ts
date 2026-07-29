import { demoAddresses, factions } from "./constants";
import type {
  AirtimeScore,
  BellHolder,
  ClaimEvent,
  RoundState,
  SimulationScenario,
  SimulationScenarioId,
} from "./types";

const holder: BellHolder = {
  address: demoAddresses.caller,
  displayName: "bellboy.eth",
  faction: "NVDA",
  claimNumber: 38,
};

const rival: BellHolder = {
  address: demoAddresses.rival,
  displayName: "chartreuse.ape",
  faction: "TSLA",
  claimNumber: 37,
};

const airtime: AirtimeScore[] = [
  { faction: "NVDA", seconds: 54 },
  { faction: "AAPL", seconds: 41 },
  { faction: "TSLA", seconds: 49 },
  { faction: "SPY", seconds: 36 },
];

const claims: ClaimEvent[] = [
  {
    id: "claim-35",
    sequence: 35,
    atSeconds: 136,
    claimant: { ...holder, claimNumber: 35, displayName: "green.candle" },
    accepted: true,
    potAfterUsd: 86,
    timeAfterSeconds: 18,
  },
  {
    id: "claim-36",
    sequence: 36,
    atSeconds: 144,
    claimant: {
      ...rival,
      claimNumber: 36,
      displayName: "cookinwithgas",
    },
    accepted: true,
    potAfterUsd: 87,
    timeAfterSeconds: 12,
  },
  {
    id: "claim-37",
    sequence: 37,
    atSeconds: 147,
    claimant: rival,
    accepted: true,
    potAfterUsd: 88,
    timeAfterSeconds: 9,
  },
  {
    id: "claim-38",
    sequence: 38,
    atSeconds: 151,
    claimant: holder,
    accepted: true,
    potAfterUsd: 89,
    timeAfterSeconds: 5,
  },
];

const baseState: RoundState = {
  phase: "live",
  timeLeftSeconds: 21,
  elapsedSeconds: 128,
  hardTimeLeftSeconds: 52,
  potUsd: 89,
  holder,
  airtime,
  claims,
  freshness: "live",
  updatedAt: "2026-07-28T20:46:03.000Z",
};

const stateFor = (
  phase: RoundState["phase"],
  overrides: Partial<RoundState> = {},
): RoundState => ({ ...baseState, phase, ...overrides });

export const scenarios: Record<SimulationScenarioId, SimulationScenario> = {
  entry: {
    id: "entry",
    label: "Entry desk",
    description: "Pick a synthetic ticker bag before the bell goes live.",
    state: stateFor("entry", {
      timeLeftSeconds: 45,
      elapsedSeconds: 0,
      hardTimeLeftSeconds: 180,
      potUsd: 50,
      holder: null,
      claims: [],
    }),
  },
  live: {
    id: "live",
    label: "Live transmission",
    description: "The bell is moving and each accepted ape adds two seconds.",
    state: baseState,
  },
  rug: {
    id: "rug",
    label: "Rug Zone",
    description:
      "The final ten seconds. Claims land, but the timer will not grow.",
    state: stateFor("rug", {
      timeLeftSeconds: 7,
      elapsedSeconds: 151,
      hardTimeLeftSeconds: 29,
    }),
  },
  finalizing: {
    id: "finalizing",
    label: "Checking the tape",
    description:
      "The clock is frozen while the chain confirms the final holder.",
    state: stateFor("finalizing", {
      timeLeftSeconds: 0,
      elapsedSeconds: 158,
      hardTimeLeftSeconds: 22,
    }),
  },
  settled: {
    id: "settled",
    label: "Final transmission",
    description: "The result is settled and the payout is ready to inspect.",
    state: stateFor("settled", {
      timeLeftSeconds: 0,
      elapsedSeconds: 158,
      hardTimeLeftSeconds: 22,
      settlementTx:
        "0x4663ba11000000000000000000000000000000000000000000000000004663",
    }),
  },
  "dead-air": {
    id: "dead-air",
    label: "Dead air",
    description: "The live feed is unavailable. Transactions are disabled.",
    state: stateFor("live", {
      freshness: "offline",
      timeLeftSeconds: 18,
    }),
  },
};

export const scenarioIds = Object.keys(scenarios) as SimulationScenarioId[];

export const getScenario = (id?: string): SimulationScenario =>
  scenarios[(id as SimulationScenarioId) || "live"] ?? scenarios.live;

export const factionById = (id: string) =>
  factions.find((faction) => faction.id === id) ?? factions[0];
