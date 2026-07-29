export type TickerId = "NVDA" | "AAPL" | "TSLA" | "SPY";
export type MarketBand = "RED" | "FLAT" | "GREEN";
export type MarketMode = "VERIFIED" | "FLAT";

export type RoundPhase =
  "entry" | "live" | "rug" | "finalizing" | "settled" | "cancelled";

export type DataFreshness = "live" | "delayed" | "offline";

export interface TickerSlot {
  id: TickerId;
  name: string;
  assetName: string;
  color: string;
  secondary: string;
  tokenAddress?: `0x${string}`;
  feedId?: `0x${string}`;
  volatilityRank: number;
  realizedMovementBps: number;
  dailyVolume: number;
  openingPrice: number;
  currentPrice: number;
  currentBand: MarketBand;
  multiplierBps: number;
}

export interface RoundConfig {
  roundId: string;
  claimPriceUsd: number;
  startSeconds: number;
  extensionSeconds: number;
  rugZoneSeconds: number;
  hardCapSeconds: number;
  marketMode: MarketMode;
  marketThresholdBps: number;
  multipliersBps: Record<MarketBand, number>;
  producerPassRequired: boolean;
  payoutBps: {
    holder: number;
    closingPrint: number;
    nextRound: number;
    protocol: number;
  };
  tickers: TickerSlot[];
}

export interface MarketReport {
  feedId: `0x${string}`;
  price: number;
  observedAt: number;
  validFrom: number;
  expiresAt: number;
  report?: `0x${string}`;
}

export interface BellHolder {
  address: `0x${string}`;
  displayName: string;
  ticker: TickerId;
  claimNumber: number;
  band: MarketBand;
  multiplierBps: number;
  verifiedPrice: number;
  reportTimestamp: number;
  producerPass: boolean;
}

export interface TickerScore {
  ticker: TickerId;
  rawSeconds: number;
  weightedScore: number;
  lastAcquisitionAt: number;
  currentBand: MarketBand;
  multiplierBps: number;
}

export interface ClaimEvent {
  id: string;
  sequence: number;
  atSeconds: number;
  claimant: BellHolder;
  previousHolder?: `0x${string}`;
  previousTicker?: TickerId;
  feeUsd?: number;
  phase?: "live" | "rug";
  transactionHash?: `0x${string}`;
  blockNumber?: number;
  logIndex?: number;
  contractVersion?: "closing-print-v1" | "faction-v0";
  accepted: boolean;
  reason?: string;
  potAfterUsd: number;
  timeAfterSeconds: number;
  verifiedPrice: number;
  reportTimestamp: number;
  marketBand: MarketBand;
  multiplierBps: number;
  intervalSeconds?: number;
  weightedPoints?: number;
  producerPass: boolean;
}

export interface RoundState {
  roundId?: string;
  phase: RoundPhase;
  marketMode: MarketMode;
  broadcastLabel: "HEAT CHECK" | "VOLUME CHECK";
  producerPassRequired: boolean;
  timeLeftSeconds: number;
  elapsedSeconds: number;
  hardTimeLeftSeconds: number;
  potUsd: number;
  holder: BellHolder | null;
  tickerScores: TickerScore[];
  claims: ClaimEvent[];
  freshness: DataFreshness;
  updatedAt: string;
  settlementTx?: `0x${string}`;
  chainId?: number;
  contractAddress?: `0x${string}`;
  contractVersion: "closing-print-v1" | "faction-v0";
  blockNumber?: number;
  startedAt?: number;
  deadline?: number;
  hardEnd?: number;
  settledAt?: number;
  nextRoundStartsInSeconds?: number;
  winningTicker?: TickerId;
  pools?: {
    holderUsd: number;
    closingPrintUsd: number;
    nextRoundUsd: number;
    protocolUsd: number;
  };
  cancellationReason?: string;
}

export interface SessionBudget {
  player: `0x${string}`;
  starterTicker: TickerId | null;
  maximumUsd: number;
  spentUsd: number;
  remainingUsd: number;
  availableActions: number;
  allowanceUsd: number;
  expiresAt: number | null;
  status: "new" | "active" | "revoked" | "expired";
  mode: "devnet-guest" | "wallet";
  producerPass: boolean;
}

export interface ClaimableBalances {
  holderUsd: number;
  closingPrintUsd: number;
  refundUsd: number;
}

export interface Receipt {
  roundId: string;
  player: BellHolder;
  placement:
    "FINAL HOLDER" | "TOP CALLER" | "CLOSING PRINT WINNER" | "EXIT LIQUIDITY";
  amountUsd: number;
  memeLine: string;
  replayPath: string;
}

export type SimulationScenarioId =
  | "entry"
  | "live"
  | "green-switch"
  | "red-switch"
  | "ticker-raid"
  | "rug"
  | "finalizing"
  | "settled"
  | "flat"
  | "stale-data"
  | "special-round"
  | "dead-air";

export interface SimulationScenario {
  id: SimulationScenarioId;
  label: string;
  description: string;
  state: RoundState;
}

export interface MarketSample {
  timestamp: number;
  price: number;
}

export interface ScreeningAsset {
  ticker: string;
  tokenAddress: `0x${string}`;
  feedId?: `0x${string}`;
  active: boolean;
  halted: boolean;
  canonical: boolean;
  dailyVolume: number;
  samples: MarketSample[];
}

export interface RosterSnapshot {
  mode: MarketMode;
  label: "HEAT CHECK" | "VOLUME CHECK";
  selected: ScreeningAsset[];
  delayed: boolean;
  screenedAt: number;
  reason?: string;
}
