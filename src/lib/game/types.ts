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

export type TransactionStage =
  | "READY"
  | "WAITING_FOR_WALLET"
  | "APPROVAL_PENDING"
  | "CONTRIBUTION_PENDING"
  | "ACCEPTED_ONCHAIN"
  | "REJECTED_NOTHING_CHARGED";

export type HeatLevel = "COLD" | "WARMING" | "COOKING" | "NUCLEAR";

export interface CanonicalProvenance {
  deploymentKey: string;
  roundId: string;
  blockNumber?: number;
  logIndex?: number;
  transactionHash?: `0x${string}`;
  contractVersion: RoundState["contractVersion"];
}

export interface TickerCaptain extends CanonicalProvenance {
  ticker: TickerId;
  address: `0x${string}`;
  displayName: string;
  points: number;
  latestAcceptedAt: number;
}

export type AchievementKind =
  | "FINAL_CALLER"
  | "BELL_SNIPER"
  | "RUG_SURVIVOR"
  | "BIGGEST_APE"
  | "STOCK_CAPTAIN"
  | "FLIP_ARTIST"
  | "HEAT_STARTER";

export interface Achievement extends CanonicalProvenance {
  id: string;
  kind: AchievementKind;
  player: `0x${string}`;
  ticker?: TickerId;
  title: string;
  detail: string;
}

export interface PotMilestone extends CanonicalProvenance {
  amountUsd: 1000 | 10000 | 25000 | 50000 | 100000;
  reachedAtSeconds: number;
}

export type RoundHighlightKind =
  | "CALL"
  | "WHALE"
  | "TICKER_FLIP"
  | "HEAT_CHANGE"
  | "POT_MILESTONE"
  | "RUG_STEAL"
  | "SETTLEMENT"
  | "CLAIM";

export interface RoundHighlight extends CanonicalProvenance {
  id: string;
  kind: RoundHighlightKind;
  headline: string;
  atSeconds: number;
  player?: `0x${string}`;
  ticker?: TickerId;
  amountUsd?: number;
}

export interface BroadcastHeadline {
  id: string;
  kind: RoundHighlightKind;
  text: string;
  verified: true;
  atSeconds: number;
}

export interface PhasePresentation {
  label: string;
  message: string;
  tone:
    | "waiting"
    | "live"
    | "final-minute"
    | "rug"
    | "settling"
    | "cancelled"
    | "settled";
}

export interface ContributionImpact {
  ticker: TickerId;
  amountUsd: number;
  currentRank: number;
  projectedRank: number;
  projectedPoints: number;
  pointsToLead: number;
  pointsToFlip: number;
  heatLevel: HeatLevel;
  expectedStockOut: number;
  minimumStockOut: string;
  approvalRequired: boolean;
}

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
  contributedUsdg?: number;
  consumedUsdg?: number;
  residualUsdg?: number;
}

export interface StockPotAsset {
  ticker: TickerId;
  tokenAddress: `0x${string}`;
  tokenAmount: number;
  estimatedUsd: number;
  assetKind?: "STOCK" | "USDG";
}

export interface StockSwapQuote {
  ticker: TickerId;
  tickerIndex: number;
  usdgAmount: number;
  estimatedStockOut: number;
  estimatedUsdgConsumed?: number;
  estimatedResidualUsdg?: number;
  minimumStockOut: string;
  quoteBlock: number;
  expiresAt: number;
  canonicalToken?: `0x${string}`;
  poolAddress?: `0x${string}`;
  marketId?: `0x${string}`;
  feeTier?: number;
  twapWindowSeconds?: number;
  twapPriceUsd?: number;
  executionDeviationBps?: number;
  maximumExecutionDeviationBps?: number;
  usdgDepth?: number;
  buyImpactBps?: number;
  sellImpactBps?: number;
  safetyObservedAt?: number;
  priceSourceChainId?: number;
  mockOnly?: boolean;
  multiplierBps: number;
  basePoints?: number;
  projectedPoints: number;
  currentTickerPoints?: number;
  projectedTickerPoints?: number;
  projectedLeader: TickerId;
  pointsToLead: number;
  pointsToLeadAfter?: number;
  currentRank?: number;
  projectedRank?: number;
  pointsToFlip?: number;
  currentPlayerTickerPoints?: number;
  projectedPlayerTickerPoints?: number;
  projectedPlayerShareBps?: number;
  projectedWinningStockRewardUsd?: number;
  pendingLifetimePoints?: number;
  heatLevel?: HeatLevel;
  approvalRequired?: boolean;
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
  contractVersion: "saved-bell-v5-market-pot" | "last-bell-v4-stock-pot";
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
    | "saved-bell-v5-market-pot"
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
  usdgConsumed?: number;
  residualUsdg?: number;
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
    | "saved-bell-v5-market-pot"
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
  totalContributedUsdg?: number;
  totalConsumedUsdg?: number;
  residualUsdg?: number;
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
  tickerCaptains?: TickerCaptain[];
  heatLevels?: Record<TickerId, HeatLevel>;
  reachedMilestones?: PotMilestone[];
  currentHeadline?: BroadcastHeadline;
  phasePresentation?: PhasePresentation;
  connectedPlayerImpact?: ContributionImpact;
  achievements?: Achievement[];
  highlights?: RoundHighlight[];
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
  recentTradingActivity?: number;
  marketSafetyObservedAt?: number;
  metadataCheckedAt?: number;
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
  catalogVersion?: `0x${string}`;
  approvedCatalogSize?: number;
  exclusions?: Array<{
    ticker: string;
    reasons: string[];
  }>;
}
