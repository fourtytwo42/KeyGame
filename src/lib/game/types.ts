export type FactionId = "NVDA" | "AAPL" | "TSLA" | "SPY";

export type RoundPhase =
  "entry" | "live" | "rug" | "finalizing" | "settled" | "cancelled";

export type DataFreshness = "live" | "delayed" | "offline";

export interface Faction {
  id: FactionId;
  name: string;
  assetName: string;
  color: string;
  secondary: string;
  memberCount: number;
}

export interface RoundConfig {
  roundId: string;
  entryPriceUsd: number;
  claimPriceUsd: number;
  startSeconds: number;
  extensionSeconds: number;
  rugZoneSeconds: number;
  hardCapSeconds: number;
  payoutBps: {
    holder: number;
    faction: number;
    rewards: number;
    protocol: number;
  };
  factions: Faction[];
}

export interface BellHolder {
  address: `0x${string}`;
  displayName: string;
  faction: FactionId;
  claimNumber: number;
}

export interface AirtimeScore {
  faction: FactionId;
  seconds: number;
}

export interface ClaimEvent {
  id: string;
  sequence: number;
  atSeconds: number;
  claimant: BellHolder;
  accepted: boolean;
  reason?: string;
  potAfterUsd: number;
  timeAfterSeconds: number;
}

export interface RoundState {
  phase: RoundPhase;
  timeLeftSeconds: number;
  elapsedSeconds: number;
  hardTimeLeftSeconds: number;
  potUsd: number;
  holder: BellHolder | null;
  airtime: AirtimeScore[];
  claims: ClaimEvent[];
  freshness: DataFreshness;
  updatedAt: string;
  settlementTx?: `0x${string}`;
}

export interface Receipt {
  roundId: string;
  player: BellHolder;
  placement:
    "FINAL HOLDER" | "TOP CALLER" | "FACTION WINNER" | "EXIT LIQUIDITY";
  amountUsd: number;
  memeLine: string;
  replayPath: string;
}

export type SimulationScenarioId =
  "entry" | "live" | "rug" | "finalizing" | "settled" | "dead-air";

export interface SimulationScenario {
  id: SimulationScenarioId;
  label: string;
  description: string;
  state: RoundState;
}
