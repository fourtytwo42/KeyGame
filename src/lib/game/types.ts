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
  previousHolder?: `0x${string}`;
  previousFaction?: FactionId;
  feeUsd?: number;
  phase?: "live" | "rug";
  transactionHash?: `0x${string}`;
  blockNumber?: number;
  logIndex?: number;
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
  chainId?: number;
  contractAddress?: `0x${string}`;
  blockNumber?: number;
  startedAt?: number;
  deadline?: number;
  hardEnd?: number;
  winningFaction?: FactionId;
  pools?: {
    holderUsd: number;
    factionUsd: number;
    nextRoundUsd: number;
    protocolUsd: number;
  };
  cancellationReason?: string;
}

export interface SessionBudget {
  player: `0x${string}`;
  faction: FactionId | null;
  maximumUsd: number;
  spentUsd: number;
  remainingUsd: number;
  availableActions: number;
  allowanceUsd: number;
  expiresAt: number | null;
  status: "unjoined" | "active" | "revoked" | "expired";
  mode: "devnet-guest" | "wallet";
}

export interface ClaimableBalances {
  holderUsd: number;
  factionUsd: number;
  refundUsd: number;
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
