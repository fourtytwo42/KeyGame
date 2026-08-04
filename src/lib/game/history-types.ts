import type { Achievement, PotMilestone, RoundState, TickerId } from "./types";

export interface HistoricalRun {
  id: string;
  deploymentKey?: string;
  roundId: string;
  finishedAt: string;
  peakPotUsd: number;
  finalHolder: string;
  finalHolderHandle?: string;
  winningTicker?: TickerId;
  claimCount: number;
  largestCallUsd?: number;
  flipCount?: number;
  lastCallTimeRemaining?: number;
  milestones?: PotMilestone[];
  achievements?: Achievement[];
  storySummary?: string;
  state: RoundState;
}

export type HistoricalRunSummary = Omit<HistoricalRun, "state">;
