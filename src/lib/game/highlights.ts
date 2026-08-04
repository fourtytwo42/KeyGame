import type {
  Achievement,
  BroadcastHeadline,
  ClaimEvent,
  HeatLevel,
  PhasePresentation,
  PotMilestone,
  RoundHighlight,
  RoundState,
  TickerCaptain,
  TickerId,
  TransactionStage,
} from "./types";

export function transactionStageFor(input: {
  walletAction: string;
  actionStatus: "idle" | "submitted" | "accepted" | "rejected";
  connected: boolean;
  chainMode: boolean;
  devnetMode: boolean;
}): TransactionStage {
  if (input.walletAction === "approving") return "APPROVAL_PENDING";
  if (input.walletAction === "claiming") return "CONTRIBUTION_PENDING";
  if (input.actionStatus === "submitted") {
    if (!input.connected && input.chainMode && !input.devnetMode)
      return "WAITING_FOR_WALLET";
    return "CONTRIBUTION_PENDING";
  }
  if (input.actionStatus === "accepted") return "ACCEPTED_ONCHAIN";
  if (input.actionStatus === "rejected") return "REJECTED_NOTHING_CHARGED";
  return "READY";
}

export function contributionShortcuts(
  pointsToLead: number,
  multiplierBps: number,
) {
  const matchLeader = Math.max(
    1,
    Math.ceil(
      (Math.max(0, pointsToLead) * 10_000) / Math.max(10_000, multiplierBps),
    ),
  );
  return {
    matchLeader,
    takeTheLead: matchLeader + 1,
    flipTheStock: matchLeader + Math.max(1, Math.ceil(matchLeader * 0.05)),
  };
}

export const POT_MILESTONES = [1_000, 10_000, 25_000, 50_000, 100_000] as const;

const provenance = (state: RoundState, claim?: ClaimEvent) => ({
  deploymentKey: `${state.chainId ?? 0}:${state.contractAddress ?? "unknown"}`,
  roundId: state.roundId ?? "unknown",
  blockNumber: claim?.blockNumber ?? state.blockNumber,
  logIndex: claim?.logIndex,
  transactionHash: claim?.transactionHash,
  contractVersion: state.contractVersion,
});

export function heatLevel(multiplierBps: number): HeatLevel {
  if (multiplierBps >= 20_000) return "NUCLEAR";
  if (multiplierBps >= 15_000) return "COOKING";
  if (multiplierBps >= 12_500) return "WARMING";
  return "COLD";
}

export function phasePresentation(state: RoundState): PhasePresentation {
  if (state.phase === "entry")
    return {
      label: "WAITING FOR THE FIRST APE",
      message: "Pick a stock and contribute to start the five-minute clock.",
      tone: "waiting",
    };
  if (state.phase === "rug")
    return {
      label: "RUG ZONE · FCFS",
      message: "Automated wallets may be faster. Last accepted call wins 50%.",
      tone: "rug",
    };
  if (state.phase === "finalizing")
    return {
      label: "CHECKING THE TAPE",
      message: "Settlement is being confirmed onchain.",
      tone: "settling",
    };
  if (state.phase === "cancelled")
    return {
      label: "ROUND CANCELLED",
      message: "Purchased Stock Tokens are available as refunds.",
      tone: "cancelled",
    };
  if (state.phase === "settled")
    return {
      label: "FINAL BELL",
      message: "Rewards are ready to verify and claim.",
      tone: "settled",
    };
  if (state.timeLeftSeconds <= 60)
    return {
      label: "FINAL MINUTE",
      message: "Every accepted contribution takes the bell.",
      tone: "final-minute",
    };
  return {
    label: "BELL IS LIVE",
    message: "Pick a stock, choose any amount, and take the bell.",
    tone: "live",
  };
}

export function deriveTickerCaptains(state: RoundState): TickerCaptain[] {
  const totals = new Map<
    string,
    {
      ticker: TickerId;
      address: `0x${string}`;
      name: string;
      points: number;
      latest: number;
      claim: ClaimEvent;
    }
  >();
  for (const claim of state.claims.filter((event) => event.accepted)) {
    const address = claim.claimant.address.toLowerCase() as `0x${string}`;
    const key = `${claim.claimant.ticker}:${address}`;
    const current = totals.get(key);
    totals.set(key, {
      ticker: claim.claimant.ticker,
      address,
      name: claim.claimant.displayName,
      points:
        (current?.points ?? 0) +
        (claim.pointsAwarded ?? claim.weightedPoints ?? 0),
      latest: Math.max(current?.latest ?? 0, claim.atSeconds),
      claim,
    });
  }
  const byTicker = new Map<TickerId, ReturnType<typeof totals.get>>();
  for (const row of totals.values()) {
    const current = byTicker.get(row.ticker);
    if (
      !current ||
      row.points > current.points ||
      (row.points === current.points &&
        (row.latest > current.latest ||
          (row.latest === current.latest && row.address < current.address)))
    )
      byTicker.set(row.ticker, row);
  }
  return [...byTicker.values()].filter(Boolean).map((row) => ({
    ...provenance(state, row!.claim),
    ticker: row!.ticker,
    address: row!.address,
    displayName: row!.name,
    points: row!.points,
    latestAcceptedAt: row!.latest,
  }));
}

function leaderAfter(points: Map<TickerId, number>) {
  return [...points.entries()].sort(
    ([aTicker, a], [bTicker, b]) => b - a || aTicker.localeCompare(bTicker),
  )[0]?.[0];
}

export function deriveHighlights(state: RoundState): RoundHighlight[] {
  const highlights: RoundHighlight[] = [];
  const points = new Map<TickerId, number>();
  const reached = new Set<number>();
  let leader: TickerId | undefined;
  let previousHeat = new Map<TickerId, HeatLevel>();
  for (const claim of state.claims.filter((event) => event.accepted)) {
    const base = provenance(state, claim);
    const ticker = claim.claimant.ticker;
    const amount = claim.usdgAmount ?? claim.feeUsd ?? 0;
    highlights.push({
      ...base,
      id: `call:${claim.id}`,
      kind:
        amount >= Math.max(1_000, claim.potAfterUsd * 0.1) ? "WHALE" : "CALL",
      headline: `${claim.claimant.displayName} APED $${amount.toLocaleString()} ON ${ticker}`,
      atSeconds: claim.atSeconds,
      player: claim.claimant.address,
      ticker,
      amountUsd: amount,
    });
    points.set(
      ticker,
      (points.get(ticker) ?? 0) +
        (claim.pointsAwarded ?? claim.weightedPoints ?? 0),
    );
    const nextLeader = leaderAfter(points);
    if (leader && nextLeader && nextLeader !== leader)
      highlights.push({
        ...base,
        id: `flip:${claim.id}`,
        kind: "TICKER_FLIP",
        headline: `${nextLeader} FLIPPED ${leader} FOR THE LEAD`,
        atSeconds: claim.atSeconds,
        player: claim.claimant.address,
        ticker: nextLeader,
      });
    leader = nextLeader;
    const nextHeat = heatLevel(claim.multiplierBps);
    const priorHeat = previousHeat.get(ticker) ?? "COLD";
    if (nextHeat !== priorHeat)
      highlights.push({
        ...base,
        id: `heat:${claim.id}`,
        kind: "HEAT_CHANGE",
        headline: `${ticker} IS ${nextHeat}`,
        atSeconds: claim.atSeconds,
        player: claim.claimant.address,
        ticker,
      });
    previousHeat = new Map(previousHeat).set(ticker, nextHeat);
    for (const milestone of POT_MILESTONES)
      if (claim.potAfterUsd >= milestone && !reached.has(milestone)) {
        reached.add(milestone);
        highlights.push({
          ...base,
          id: `milestone:${milestone}`,
          kind: "POT_MILESTONE",
          headline: `$${milestone.toLocaleString()} POT UNLOCKED`,
          atSeconds: claim.atSeconds,
          amountUsd: milestone,
        });
      }
    if (claim.phase === "rug")
      highlights.push({
        ...base,
        id: `rug:${claim.id}`,
        kind: "RUG_STEAL",
        headline: `${claim.claimant.displayName} STOLE THE BELL IN RUG ZONE`,
        atSeconds: claim.atSeconds,
        player: claim.claimant.address,
        ticker,
      });
  }
  if (state.phase === "settled")
    highlights.push({
      ...provenance(state),
      id: `settled:${state.roundId}`,
      kind: "SETTLEMENT",
      headline: `${state.winningTicker ?? leader ?? "NO STOCK"} WON · ${state.holder?.displayName ?? "NO CALLER"} SAVED BY THE BELL`,
      atSeconds: state.elapsedSeconds,
    });
  return highlights;
}

export function deriveMilestones(state: RoundState): PotMilestone[] {
  return deriveHighlights(state)
    .filter((item) => item.kind === "POT_MILESTONE")
    .map((item) => ({
      ...provenance(state),
      amountUsd: item.amountUsd as PotMilestone["amountUsd"],
      reachedAtSeconds: item.atSeconds,
    }));
}

export function deriveAchievements(state: RoundState): Achievement[] {
  const accepted = state.claims.filter((event) => event.accepted);
  if (!accepted.length) return [];
  const final = accepted.at(-1)!;
  const biggest = [...accepted].sort(
    (a, b) =>
      (b.usdgAmount ?? 0) - (a.usdgAmount ?? 0) || b.atSeconds - a.atSeconds,
  )[0];
  const captains = deriveTickerCaptains(state);
  const highlights = deriveHighlights(state);
  const achievements: Achievement[] = [];
  const add = (
    claim: ClaimEvent,
    kind: Achievement["kind"],
    title: string,
    detail: string,
    ticker = claim.claimant.ticker,
  ) =>
    achievements.push({
      ...provenance(state, claim),
      id: `${kind}:${claim.claimant.address}:${ticker}`,
      kind,
      player: claim.claimant.address,
      ticker,
      title,
      detail,
    });
  if (state.phase === "settled")
    add(
      final,
      "FINAL_CALLER",
      "FINAL CALLER",
      "Held the bell when the clock hit zero.",
    );
  if (state.phase === "settled" && final.timeAfterSeconds <= 3)
    add(
      final,
      "BELL_SNIPER",
      "BELL SNIPER",
      `Stole it with ${final.timeAfterSeconds.toFixed(1)}s left.`,
    );
  if (state.phase === "settled" && final.phase === "rug")
    add(final, "RUG_SURVIVOR", "RUG SURVIVOR", "Won the FCFS Rug Zone.");
  add(
    biggest,
    "BIGGEST_APE",
    "BIGGEST APE",
    `Largest call: $${(biggest.usdgAmount ?? 0).toLocaleString()}.`,
  );
  for (const captain of captains)
    achievements.push({
      ...captain,
      id: `STOCK_CAPTAIN:${captain.address}:${captain.ticker}`,
      kind: "STOCK_CAPTAIN",
      player: captain.address,
      title: "STOCK CAPTAIN",
      detail: `${captain.points.toLocaleString()} points on ${captain.ticker}.`,
    });
  const flips = new Map<string, number>();
  for (const item of highlights.filter(
    (highlight) => highlight.kind === "TICKER_FLIP" && highlight.player,
  ))
    flips.set(
      item.player!.toLowerCase(),
      (flips.get(item.player!.toLowerCase()) ?? 0) + 1,
    );
  const flipWinner = [...flips.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  if (flipWinner) {
    const claim = accepted.find(
      (item) => item.claimant.address.toLowerCase() === flipWinner[0],
    )!;
    add(
      claim,
      "FLIP_ARTIST",
      "FLIP ARTIST",
      `${flipWinner[1]} lead flip${flipWinner[1] === 1 ? "" : "s"}.`,
    );
  }
  const heatStarter = accepted.find((claim) => claim.multiplierBps > 10_000);
  if (heatStarter)
    add(
      heatStarter,
      "HEAT_STARTER",
      "HEAT STARTER",
      `Pushed ${heatStarter.claimant.ticker} to ${heatLevel(heatStarter.multiplierBps)}.`,
    );
  return achievements;
}

export function currentHeadline(state: RoundState): BroadcastHeadline {
  const latest = deriveHighlights(state).at(-1);
  return latest
    ? {
        id: latest.id,
        kind: latest.kind,
        text: latest.headline,
        verified: true,
        atSeconds: latest.atSeconds,
      }
    : {
        id: `waiting:${state.roundId}`,
        kind: "CALL",
        text: "THE BELL IS WAITING FOR ITS FIRST CALLER",
        verified: true,
        atSeconds: 0,
      };
}

export function enrichRoundState(state: RoundState): RoundState {
  return {
    ...state,
    tickerCaptains: deriveTickerCaptains(state),
    heatLevels: Object.fromEntries(
      state.tickerScores.map((score) => [
        score.ticker,
        heatLevel(score.multiplierBps),
      ]),
    ),
    reachedMilestones: deriveMilestones(state),
    highlights: deriveHighlights(state),
    achievements: deriveAchievements(state),
    currentHeadline: currentHeadline(state),
    phasePresentation: phasePresentation(state),
  };
}

export function buildStorySummary(state: RoundState) {
  const highlights = deriveHighlights(state);
  const flips = highlights.filter((item) => item.kind === "TICKER_FLIP").length;
  const final = state.claims.filter((claim) => claim.accepted).at(-1);
  return `$${state.potUsd.toLocaleString()} POT · ${state.winningTicker ?? "NO STOCK"} WON · ${state.claims.filter((claim) => claim.accepted).length} CALLS · ${final ? `STOLEN WITH ${final.timeAfterSeconds.toFixed(1)}S LEFT` : "NO FINAL CALL"}${flips ? ` · ${flips} FLIP${flips === 1 ? "" : "S"}` : ""}`;
}
