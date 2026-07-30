import type { RoundState, TickerId } from "./types";

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
  state: RoundState;
}

export type HistoricalRunSummary = Omit<HistoricalRun, "state">;
