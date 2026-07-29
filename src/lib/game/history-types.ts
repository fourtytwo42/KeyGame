import type { RoundState, TickerId } from "./types";

export interface HistoricalRun {
  id: string;
  roundId: string;
  finishedAt: string;
  peakPotUsd: number;
  finalHolder: string;
  winningTicker?: TickerId;
  claimCount: number;
  state: RoundState;
}

export type HistoricalRunSummary = Omit<HistoricalRun, "state">;
