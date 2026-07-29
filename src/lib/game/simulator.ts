import { roundConfig } from "./constants";
import type { BellHolder, ClaimEvent, FactionId, RoundState } from "./types";

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
  let phase: RoundState["phase"] = state.phase;

  if (nextTime <= 0 || nextHard <= 0) phase = "finalizing";
  else if (nextTime <= roundConfig.rugZoneSeconds) phase = "rug";
  else phase = "live";

  const airtime = state.holder
    ? state.airtime.map((score) =>
        score.faction === state.holder?.faction
          ? { ...score, seconds: score.seconds + applied }
          : score,
      )
    : state.airtime;

  return {
    ...state,
    phase,
    timeLeftSeconds: nextTime,
    elapsedSeconds: nextElapsed,
    hardTimeLeftSeconds: nextHard,
    airtime,
    updatedAt: new Date().toISOString(),
  };
}

export function claimBell(
  state: RoundState,
  claimant: Omit<BellHolder, "claimNumber">,
): ClaimResult {
  const sequence = state.claims.length + 1;
  const nextHolder: BellHolder = { ...claimant, claimNumber: sequence };
  const rejectedReason =
    state.freshness !== "live"
      ? "Live data is unavailable"
      : state.phase !== "live" && state.phase !== "rug"
        ? "The round is not accepting claims"
        : state.holder?.address.toLowerCase() === claimant.address.toLowerCase()
          ? "The current holder cannot ape on their own bell"
          : undefined;

  if (rejectedReason) {
    const event: ClaimEvent = {
      id: `claim-${sequence}-rejected`,
      sequence,
      atSeconds: state.elapsedSeconds,
      claimant: nextHolder,
      accepted: false,
      reason: rejectedReason,
      potAfterUsd: state.potUsd,
      timeAfterSeconds: state.timeLeftSeconds,
    };
    return { state: { ...state, claims: [...state.claims, event] }, event };
  }

  const canExtend =
    state.phase !== "rug" &&
    state.timeLeftSeconds > roundConfig.rugZoneSeconds &&
    state.hardTimeLeftSeconds > state.timeLeftSeconds;
  const extended = canExtend
    ? Math.min(
        state.timeLeftSeconds + roundConfig.extensionSeconds,
        state.hardTimeLeftSeconds,
      )
    : state.timeLeftSeconds;
  const event: ClaimEvent = {
    id: `claim-${sequence}`,
    sequence,
    atSeconds: state.elapsedSeconds,
    claimant: nextHolder,
    accepted: true,
    potAfterUsd: state.potUsd + roundConfig.claimPriceUsd,
    timeAfterSeconds: extended,
  };

  return {
    state: {
      ...state,
      holder: nextHolder,
      potUsd: event.potAfterUsd,
      timeLeftSeconds: extended,
      claims: [...state.claims, event],
      updatedAt: new Date().toISOString(),
    },
    event,
  };
}

export function leadingFaction(state: RoundState): FactionId {
  return [...state.airtime].sort((a, b) => {
    if (a.seconds !== b.seconds) return b.seconds - a.seconds;
    return (
      roundConfig.factions.findIndex((faction) => faction.id === a.faction) -
      roundConfig.factions.findIndex((faction) => faction.id === b.faction)
    );
  })[0].faction;
}

export function settle(state: RoundState): RoundState {
  if (state.phase !== "finalizing" || !state.holder) return state;
  return {
    ...state,
    phase: "settled",
    settlementTx:
      "0x4663ba11000000000000000000000000000000000000000000000000004663",
    updatedAt: new Date().toISOString(),
  };
}
