import type {
  EstimatedMarketBand,
  PlayerRoundProjection,
  RoundProjection,
  RoundState,
  TickerScore,
} from "./types";

const EPSILON = 1e-9;

function projectedPools(state: RoundState) {
  if (state.phase === "cancelled") {
    return { holderUsd: 0, closingPrintUsd: 0 };
  }
  if (state.phase === "settled") {
    return {
      holderUsd: state.pools?.holderUsd ?? state.potUsd * 0.5,
      closingPrintUsd: state.pools?.closingPrintUsd ?? state.potUsd * 0.3,
    };
  }
  return {
    holderUsd: state.potUsd * 0.5,
    closingPrintUsd: state.potUsd * 0.3,
  };
}

export function projectedWinningTicker(scores: TickerScore[]) {
  if (!scores.length) return null;
  return scores.reduce((leader, candidate, candidateIndex) => {
    const leaderIndex = scores.indexOf(leader);
    if (candidate.weightedScore > leader.weightedScore + EPSILON) {
      return candidate;
    }
    if (
      Math.abs(candidate.weightedScore - leader.weightedScore) <= EPSILON &&
      (candidate.lastAcquisitionAt > leader.lastAcquisitionAt ||
        (candidate.lastAcquisitionAt === leader.lastAcquisitionAt &&
          candidateIndex < leaderIndex))
    ) {
      return candidate;
    }
    return leader;
  }).ticker;
}

export function buildRoundProjection(state: RoundState): RoundProjection {
  const snapshotTime = Math.floor(new Date(state.updatedAt).getTime() / 1_000);
  const winner = projectedWinningTicker(state.tickerScores);
  const currentScore = state.holder
    ? state.tickerScores.find((score) => score.ticker === state.holder?.ticker)
    : undefined;
  const estimatedBands: EstimatedMarketBand[] = state.tickerScores.map(
    (score) => ({
      ticker: score.ticker,
      band:
        state.marketMode === "FLAT"
          ? "FLAT"
          : (score.estimatedBand ?? score.currentBand),
      multiplierBps:
        state.marketMode === "FLAT"
          ? 10_000
          : (score.estimatedMultiplierBps ?? score.multiplierBps),
      observedAt: score.observationAt ?? snapshotTime,
      freshness: state.freshness,
    }),
  );
  const pools = projectedPools(state);
  return {
    snapshotBlock: state.blockNumber,
    snapshotTime,
    finalHolder: state.holder?.address ?? null,
    finalHolderDisplayName: state.holder?.displayName ?? null,
    holderPoolUsd: pools.holderUsd,
    winningTicker: winner,
    closingPrintPoolUsd: pools.closingPrintUsd,
    currentEarning:
      state.holder &&
      currentScore &&
      (state.phase === "live" || state.phase === "rug")
        ? {
            ticker: state.holder.ticker,
            band: state.holder.band,
            multiplierBps: state.holder.multiplierBps,
            pointsPerSecond: state.holder.multiplierBps / 10_000,
            rawAirtimeSeconds: currentScore.rawSeconds,
            weightedPoints: currentScore.weightedScore,
          }
        : null,
    estimatedBands,
    isEstimate: true,
  };
}

export function buildPlayerRoundProjection(input: {
  state: RoundState;
  address: `0x${string}`;
  rawAirtime: number[];
  weightedPoints: number[];
  pendingRawSeconds?: number;
}): PlayerRoundProjection {
  const { state, address } = input;
  const currentIndex = state.holder
    ? state.tickerScores.findIndex(
        (score) => score.ticker === state.holder?.ticker,
      )
    : -1;
  const isCurrentHolder =
    state.holder?.address.toLowerCase() === address.toLowerCase();
  const pendingRawSeconds =
    isCurrentHolder && currentIndex >= 0 ? (input.pendingRawSeconds ?? 0) : 0;
  const perTicker = state.tickerScores.map((score, index) => {
    const pending = index === currentIndex ? pendingRawSeconds : 0;
    const pendingWeighted =
      pending *
      (index === currentIndex
        ? (state.holder?.multiplierBps ?? 10_000) / 10_000
        : 1);
    return {
      ticker: score.ticker,
      rawAirtimeSeconds: (input.rawAirtime[index] ?? 0) + pending,
      weightedPoints: (input.weightedPoints[index] ?? 0) + pendingWeighted,
      pendingRawSeconds: pending,
      pendingWeightedPoints: pendingWeighted,
    };
  });
  const winner = projectedWinningTicker(state.tickerScores);
  const winnerIndex = state.tickerScores.findIndex(
    (score) => score.ticker === winner,
  );
  const winningRaw = state.tickerScores[winnerIndex]?.rawSeconds ?? 0;
  const playerWinningRaw =
    winnerIndex >= 0 ? perTicker[winnerIndex].rawAirtimeSeconds : 0;
  const pools = projectedPools(state);
  const holderPool = pools.holderUsd;
  const printPool = pools.closingPrintUsd;
  const projectedHolderRewardUsd = isCurrentHolder ? holderPool : 0;
  const projectedClosingPrintRewardUsd =
    winningRaw > 0 ? (printPool * playerWinningRaw) / winningRaw : 0;
  return {
    address,
    roundId: state.roundId ?? "0",
    snapshotBlock: state.blockNumber,
    snapshotTime: Math.floor(new Date(state.updatedAt).getTime() / 1_000),
    perTicker,
    projectedHolderRewardUsd,
    projectedClosingPrintRewardUsd,
    projectedTotalRewardUsd:
      projectedHolderRewardUsd + projectedClosingPrintRewardUsd,
    isCurrentHolder,
    isEstimate: true,
  };
}
