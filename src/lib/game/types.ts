export type TickerId = string;
export type MarketBand = "RED" | "FLAT" | "GREEN";
export type MarketMode = "DEX" | "FLAT";
export type PriceSourceChain = "ROBINHOOD_MAINNET" | "LOCAL_DEVNET";

export interface TwapWindow {
  seconds: 600;
  requiredHistorySeconds: 1800;
}

export interface PoolSafety {
  eligible: boolean;
  usdgDepth: number;
  buyImpactBps: number;
  sellImpactBps: number;
  spotTwapDeviationBps: number;
  sampleCount: number;
  reasons: string[];
}

export interface DexMarket {
  marketId: `0x${string}`;
  poolAddress: `0x${string}`;
  stockTokenAddress: `0x${string}`;
  quoteTokenAddress: `0x${string}`;
  factoryAddress: `0x${string}`;
  feeTier: number;
  sourceChainId: number;
  twap: TwapWindow;
  safety: PoolSafety;
}

export interface DexObservation {
  marketId: `0x${string}`;
  poolAddress: `0x${string}`;
  twapTick: number;
  price: number;
  sourceChainId: number;
  sourceBlockNumber: number;
  sourceBlockHash: `0x${string}`;
  observedAt: number;
  expiresAt: number;
  sourceReportHash: `0x${string}`;
}

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
  marketId?: `0x${string}`;
  dexMarket?: DexMarket;
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
    airtime: number;
    nextRound: number;
    protocol: number;
  };
  tickers: TickerSlot[];
}

export interface MarketReport {
  marketId: `0x${string}`;
  price: number;
  observedAt: number;
  validFrom: number;
  expiresAt: number;
  report?: `0x${string}`;
  sourceReportHash?: `0x${string}`;
  sourcePool?: `0x${string}`;
  sourceChainId?: number;
  sourceBlockNumber?: number;
  sourceBlockHash?: `0x${string}`;
  verifierType?: "mock" | "testnet-dex-attested" | "dex-onchain";
  observation?: DexObservation;
}

export interface BellHolder {
  address: `0x${string}`;
  displayName: string;
  profileHandle?: string;
  ticker: TickerId;
  claimNumber: number;
  band: MarketBand;
  multiplierBps: number;
  verifiedPrice: number;
  reportTimestamp: number;
  sourceReportHash?: `0x${string}`;
  sourcePool?: `0x${string}`;
  sourceChainId?: number;
  sourceBlockNumber?: number;
  sourceBlockHash?: `0x${string}`;
  producerPass: boolean;
}

export interface TickerScore {
  ticker: TickerId;
  rawSeconds: number;
  weightedScore: number;
  lastAcquisitionAt: number;
  currentBand: MarketBand;
  multiplierBps: number;
  payoutAirtimeSeconds?: number;
  openingPrice?: number;
  currentPrice?: number;
  poolSafety?: PoolSafety;
  volatilityRank?: number;
  realizedMovementBps?: number;
  estimatedBand?: MarketBand;
  estimatedMultiplierBps?: number;
  observationAt?: number;
  recentVolumeUsd?: number;
  playerPoints?: number;
  pointsNeededToLead?: number;
  potTokenQuantity?: number;
  potValueUsd?: number;
}

export interface StockPotAsset {
  ticker: TickerId;
  tokenAddress: `0x${string}`;
  tokenAmount: number;
  estimatedUsd: number;
}

export interface StockSwapQuote {
  ticker: TickerId;
  usdgAmount: number;
  estimatedStockOut: number;
  minimumStockOut: string;
  quoteBlock: number;
  expiresAt: number;
  multiplierBps: number;
  projectedPoints: number;
  projectedLeader: TickerId;
  pointsToLead: number;
}

export interface VolumeHeat {
  ticker: TickerId;
  recentVolumeUsd: number;
  heatTargetUsd: number;
  multiplierBps: number;
}

export interface TokenRewardBalance {
  ticker: TickerId;
  tokenAddress: `0x${string}`;
  claimable: number;
  claimed: number;
  totalEarned: number;
  estimatedUsd: number;
}

export interface LifetimePointsState {
  activePoints: number;
  pendingPoints: number;
  totalEligiblePoints: number;
  shareBps: number;
  perTicker: Array<{ ticker: TickerId; points: number }>;
}

export interface RewardLedgerEntry {
  id: string;
  roundId: string;
  category: "LAST_BELL" | "WINNING_STOCK" | "LIFETIME" | "REFUND";
  token: TickerId;
  numerator: number;
  denominator: number;
  poolPercent: number;
  amount: number;
  settlementTx?: `0x${string}`;
  claimTx?: `0x${string}`;
  contractVersion: "last-bell-v4-stock-pot";
}

export interface LeaderboardEntry {
  rank: number;
  address: `0x${string}`;
  displayName: string;
  metric: string;
  value: number;
  ticker?: TickerId;
}

export interface LiveEarningRate {
  ticker: TickerId;
  band: MarketBand;
  multiplierBps: number;
  pointsPerSecond: number;
  rawAirtimeSeconds: number;
  weightedPoints: number;
}

export interface EstimatedMarketBand {
  ticker: TickerId;
  band: MarketBand;
  multiplierBps: number;
  observedAt: number;
  freshness: DataFreshness;
}

export interface RoundProjection {
  snapshotBlock?: number;
  snapshotTime: number;
  finalHolder: `0x${string}` | null;
  finalHolderDisplayName: string | null;
  holderPoolUsd: number;
  closingPrintCrown: {
    ticker: TickerId | null;
    weightedPoints: number;
  };
  airtimePoolUsd: number;
  totalRawAirtimeSeconds: number;
  currentEarning: LiveEarningRate | null;
  estimatedBands: EstimatedMarketBand[];
  isEstimate: true;
}

export interface PlayerRoundProjection {
  address: `0x${string}`;
  roundId: string;
  snapshotBlock?: number;
  snapshotTime: number;
  perTicker: Array<{
    ticker: TickerId;
    rawAirtimeSeconds: number;
    weightedPoints: number;
    pendingRawSeconds: number;
    pendingWeightedPoints: number;
  }>;
  projectedHolderRewardUsd: number;
  playerRawAirtimeSeconds: number;
  projectedAirtimeShareBps: number;
  projectedAirtimeRewardUsd: number;
  projectedTotalRewardUsd: number;
  isCurrentHolder: boolean;
  isEstimate: true;
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
  contractVersion?:
    | "last-bell-v4-stock-pot"
    | "closing-print-v3-airtime"
    | "closing-print-v2-dex"
    | "closing-print-v1"
    | "faction-v0";
  accepted: boolean;
  reason?: string;
  potAfterUsd: number;
  timeAfterSeconds: number;
  verifiedPrice: number;
  reportTimestamp: number;
  sourceReportHash?: `0x${string}`;
  sourcePool?: `0x${string}`;
  sourceChainId?: number;
  sourceBlockNumber?: number;
  sourceBlockHash?: `0x${string}`;
  marketBand: MarketBand;
  multiplierBps: number;
  intervalSeconds?: number;
  weightedPoints?: number;
  producerPass: boolean;
  usdgAmount?: number;
  stockReceived?: number;
  recentVolumeUsd?: number;
  pointsAwarded?: number;
}

export interface RoundState {
  roundId?: string;
  phase: RoundPhase;
  marketMode: MarketMode;
  broadcastLabel: "HEAT CHECK" | "VOLUME CHECK";
  marketExplanation?: string;
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
  contractVersion:
    | "last-bell-v4-stock-pot"
    | "closing-print-v3-airtime"
    | "closing-print-v2-dex"
    | "closing-print-v1"
    | "faction-v0";
  blockNumber?: number;
  startedAt?: number;
  deadline?: number;
  hardEnd?: number;
  settledAt?: number;
  nextRoundStartsInSeconds?: number;
  stockPot?: StockPotAsset[];
  stockPotValueUsd?: number;
  largestCallUsd?: number;
  heatTargetUsd?: number;
  winningTicker?: TickerId;
  pools?: {
    holderUsd: number;
    airtimeUsd: number;
    historicalClosingPrintPoolUsd?: number;
    nextRoundUsd: number;
    protocolUsd: number;
  };
  projection?: RoundProjection;
  cancellationReason?: string;
}

export type RaidCampaignState =
  "GATHERING" | "COUNTDOWN" | "LIVE" | "COOLDOWN" | "EXPIRED";

export interface RaidCampaign {
  id: string;
  deploymentKey: string;
  state: RaidCampaignState;
  eligibleVoters: number;
  threshold: number;
  voteCount: number;
  viewerEligible: boolean;
  viewerVoted: boolean;
  gatheringExpiresAt: string;
  countdownStartsAt?: string;
  liveStartsAt?: string;
  liveEndsAt?: string;
  cooldownEndsAt?: string;
  discrepancy?: string;
}

export interface PlayerProfile {
  address: `0x${string}`;
  handle: string;
  displayName: string;
  favoriteTicker?: TickerId;
  avatarSeed: string;
  createdAt: string;
  updatedAt: string;
  stats: {
    calls: number;
    roundsPlayed: number;
    finalBells: number;
    closingPrintCrownContributions: number;
    totalRawAirtimeSeconds: number;
    topTicker?: TickerId;
    claimedRewardsUsd: number;
  };
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
  airtimeUsd: number;
  refundUsd: number;
}

export interface Receipt {
  roundId: string;
  player: BellHolder;
  placement:
    | "FINAL HOLDER"
    | "TOP CALLER"
    | "AIRTIME CALLER"
    | "CLOSING PRINT CROWN"
    | "EXIT LIQUIDITY";
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
  canonicalAddress?: `0x${string}`;
  testnetMockAddress?: `0x${string}`;
  marketId?: `0x${string}`;
  dexMarket?: DexMarket;
  name?: string;
  active: boolean;
  halted: boolean;
  canonical: boolean;
  dailyVolume: number;
  currentMultiplier?: number;
  quoteGeneratedAt?: number;
  mockOnly?: boolean;
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
