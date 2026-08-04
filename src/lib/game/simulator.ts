import { roundConfig } from "./constants";
import type { BellHolder, ClaimEvent, RoundState, TickerId } from "./types";

const isStockPot = (state: RoundState) =>
  state.contractVersion === "saved-bell-v5-market-pot" ||
  state.contractVersion === "last-bell-v4-stock-pot";

export interface ClaimResult {
  state: RoundState;
  event: ClaimEvent;
}

export function tick(state: RoundState, seconds = 1): RoundState {
  if (
    state.phase === "entry" ||
    state.phase === "settled" ||
    state.phase === "cancelled" ||
    state.phase === "finalizing"
  ) {
    return state;
  }

  const applied = Math.max(0, Math.min(seconds, state.timeLeftSeconds));
  const nextTime = state.timeLeftSeconds - applied;
  const nextElapsed = state.elapsedSeconds + applied;
  const nextHard = Math.max(0, state.hardTimeLeftSeconds - applied);
  const phase: RoundState["phase"] =
    nextTime <= 0 || nextHard <= 0
      ? "finalizing"
      : nextTime <= roundConfig.rugZoneSeconds
        ? "rug"
        : "live";

  const tickerScores = isStockPot(state)
    ? state.tickerScores
    : state.holder
      ? state.tickerScores.map((score) =>
          score.ticker === state.holder?.ticker
            ? {
                ...score,
                rawSeconds: score.rawSeconds + applied,
                weightedScore:
                  score.weightedScore +
                  (applied * state.holder.multiplierBps) / 10_000,
              }
            : score,
        )
      : state.tickerScores;

  return {
    ...state,
    phase,
    timeLeftSeconds: nextTime,
    elapsedSeconds: nextElapsed,
    hardTimeLeftSeconds: nextHard,
    tickerScores,
    updatedAt: new Date().toISOString(),
  };
}

export function claimBell(
  state: RoundState,
  claimant: Omit<BellHolder, "claimNumber">,
  usdgAmount = 10,
): ClaimResult {
  const sequence = state.claims.length + 1;
  const nextHolder: BellHolder = { ...claimant, claimNumber: sequence };
  const rejectedReason =
    state.freshness !== "live"
      ? "Verified market data is unavailable"
      : state.phase !== "live" &&
          state.phase !== "rug" &&
          state.phase !== "entry"
        ? "The round is not accepting claims"
        : state.holder?.address.toLowerCase() === claimant.address.toLowerCase()
          ? "The current holder cannot ape on their own bell"
          : state.producerPassRequired && !claimant.producerPass
            ? "This broadcast requires a Producer Pass"
            : undefined;

  const baseEvent: ClaimEvent = {
    id: `claim-${sequence}`,
    sequence,
    atSeconds: state.elapsedSeconds,
    claimant: nextHolder,
    previousHolder: state.holder?.address,
    previousTicker: state.holder?.ticker,
    feeUsd: rejectedReason ? 0 : usdgAmount,
    phase: state.phase === "rug" ? "rug" : "live",
    contractVersion: state.contractVersion,
    accepted: !rejectedReason,
    reason: rejectedReason,
    potAfterUsd: state.potUsd,
    timeAfterSeconds: state.timeLeftSeconds,
    verifiedPrice: claimant.verifiedPrice,
    reportTimestamp: claimant.reportTimestamp,
    marketBand: claimant.band,
    multiplierBps: claimant.multiplierBps,
    usdgAmount: rejectedReason ? 0 : usdgAmount,
    usdgConsumed: rejectedReason ? 0 : usdgAmount,
    residualUsdg: 0,
    pointsAwarded: rejectedReason
      ? 0
      : (usdgAmount * claimant.multiplierBps) / 10_000,
    stockReceived: rejectedReason ? 0 : usdgAmount / claimant.verifiedPrice,
    producerPass: claimant.producerPass,
  };

  if (rejectedReason) {
    return {
      state: { ...state, claims: [...state.claims, baseEvent] },
      event: baseEvent,
    };
  }

  const extended = Math.min(
    roundConfig.extensionSeconds,
    state.hardTimeLeftSeconds,
  );
  const event: ClaimEvent = {
    ...baseEvent,
    potAfterUsd: state.potUsd + usdgAmount,
    timeAfterSeconds: extended,
  };

  return {
    state: {
      ...state,
      phase: state.phase === "entry" ? "live" : state.phase,
      holder: nextHolder,
      potUsd: event.potAfterUsd,
      timeLeftSeconds: extended,
      tickerScores: state.tickerScores.map((score) =>
        score.ticker === claimant.ticker
          ? {
              ...score,
              lastAcquisitionAt: state.elapsedSeconds,
              currentBand: claimant.band,
              multiplierBps: claimant.multiplierBps,
              weightedScore: isStockPot(state)
                ? score.weightedScore +
                  (usdgAmount * claimant.multiplierBps) / 10_000
                : score.weightedScore,
              recentVolumeUsd: isStockPot(state)
                ? (score.recentVolumeUsd ?? 0) + usdgAmount
                : score.recentVolumeUsd,
            }
          : score,
      ),
      claims: [...state.claims, event],
      updatedAt: new Date().toISOString(),
    },
    event,
  };
}

export function leadingTicker(state: RoundState): TickerId {
  return [...state.tickerScores].sort((left, right) => {
    if (left.weightedScore !== right.weightedScore) {
      return right.weightedScore - left.weightedScore;
    }
    if (left.lastAcquisitionAt !== right.lastAcquisitionAt) {
      return right.lastAcquisitionAt - left.lastAcquisitionAt;
    }
    return (
      roundConfig.tickers.findIndex((ticker) => ticker.id === left.ticker) -
      roundConfig.tickers.findIndex((ticker) => ticker.id === right.ticker)
    );
  })[0].ticker;
}

export function settle(state: RoundState): RoundState {
  if (state.phase !== "finalizing" || !state.holder) return state;
  return {
    ...state,
    phase: "settled",
    winningTicker: leadingTicker(state),
    pools: {
      holderUsd: state.potUsd * 0.5,
      airtimeUsd: state.potUsd * 0.3,
      nextRoundUsd: state.potUsd * 0.15,
      protocolUsd: state.potUsd * 0.05,
    },
    settlementTx:
      "0x4663ba11000000000000000000000000000000000000000000000000004663",
    updatedAt: new Date().toISOString(),
  };
}
