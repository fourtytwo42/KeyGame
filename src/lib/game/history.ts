import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { roundConfig } from "./constants";
import type { HistoricalRun, HistoricalRunSummary } from "./history-types";
import type { RoundState } from "./types";
import {
  buildStorySummary,
  deriveAchievements,
  deriveHighlights,
  deriveMilestones,
} from "./highlights";

const historyDirectory = path.join(process.cwd(), ".devnet");
const historyPath = path.join(historyDirectory, "round-history.json");
let pendingWrite: Promise<void> = Promise.resolve();

async function readRuns(): Promise<HistoricalRun[]> {
  try {
    return JSON.parse(
      await fs.readFile(historyPath, "utf8"),
    ) as HistoricalRun[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeRuns(runs: HistoricalRun[]) {
  await fs.mkdir(historyDirectory, { recursive: true });
  const temporaryPath = `${historyPath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(runs, null, 2), "utf8");
  await fs.rename(temporaryPath, historyPath);
}

function archiveId(state: RoundState) {
  const roundId = state.roundId ?? roundConfig.roundId;
  const identity =
    state.settlementTx ??
    `${state.contractAddress ?? "sim"}-${state.blockNumber ?? "unknown"}`;
  return `${roundId}-${identity.replace(/^0x/, "").slice(-12)}`;
}

export async function recordCompletedRun(state: RoundState) {
  if (state.phase !== "settled") return;

  pendingWrite = pendingWrite.then(async () => {
    const runs = await readRuns();
    const id = archiveId(state);
    if (runs.some((run) => run.id === id)) return;

    const highlights = deriveHighlights(state);
    const finalCall = state.claims.filter((claim) => claim.accepted).at(-1);
    runs.unshift({
      id,
      roundId: state.roundId ?? roundConfig.roundId,
      finishedAt: state.updatedAt,
      peakPotUsd: state.potUsd,
      finalHolder: state.holder?.displayName ?? "NO FINAL CALLER",
      winningTicker: state.winningTicker,
      claimCount: state.claims.length,
      largestCallUsd:
        state.largestCallUsd ??
        Math.max(0, ...state.claims.map((claim) => claim.usdgAmount ?? 0)),
      flipCount: highlights.filter((item) => item.kind === "TICKER_FLIP")
        .length,
      lastCallTimeRemaining: finalCall?.timeAfterSeconds,
      milestones: deriveMilestones(state),
      achievements: deriveAchievements(state),
      storySummary: buildStorySummary(state),
      state,
    });
    await writeRuns(runs.slice(0, 20));
  });

  await pendingWrite;
}

export async function getHistoricalRun(id: string) {
  return (await readRuns()).find((run) => run.id === id);
}

export async function getHistoricalRunSummaries(): Promise<
  HistoricalRunSummary[]
> {
  return (await readRuns()).map((run) => ({
    id: run.id,
    roundId: run.roundId,
    finishedAt: run.finishedAt,
    peakPotUsd: run.peakPotUsd,
    finalHolder: run.finalHolder,
    winningTicker: run.winningTicker,
    claimCount: run.claimCount,
    largestCallUsd: run.largestCallUsd,
    flipCount: run.flipCount,
    lastCallTimeRemaining: run.lastCallTimeRemaining,
    milestones: run.milestones,
    achievements: run.achievements,
    storySummary: run.storySummary,
  }));
}
