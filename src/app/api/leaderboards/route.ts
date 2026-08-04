import { NextResponse } from "next/server";
import { getV4DevnetSnapshot } from "@/lib/web3/v4-devnet-runtime";
import { isV4DevnetRuntime } from "@/lib/server/runtime-deployment";
import { getV4ProductionLeaderboards } from "@/lib/server/v4-production";
import { deriveAchievements } from "@/lib/game/highlights";

export const dynamic = "force-dynamic";

const scopes = ["round", "season", "lifetime"] as const;
const metrics = [
  "points",
  "settled-volume",
  "largest-call",
  "captain-wins",
  "stock-flips",
  "final-bells",
  "claimed-rewards",
] as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") ?? "round";
  const metric = url.searchParams.get("metric") ?? "points";
  if (
    !scopes.includes(scope as (typeof scopes)[number]) ||
    !metrics.includes(metric as (typeof metrics)[number])
  )
    return NextResponse.json(
      { ok: false, error: "Invalid leaderboard scope or metric." },
      { status: 400 },
    );
  if (!isV4DevnetRuntime()) {
    const all = await getV4ProductionLeaderboards();
    const selectedRows = [...all[scope as "round" | "season" | "lifetime"]]
      .sort((a, b) => {
        const value = (row: typeof a) =>
          metric === "settled-volume"
            ? row.settledUsdgContributed
            : metric === "largest-call"
              ? row.largestCall
              : metric === "captain-wins"
                ? row.captainWins
                : metric === "stock-flips"
                  ? row.stockFlips
                  : metric === "final-bells"
                    ? row.finalBells
                    : metric === "claimed-rewards"
                      ? row.claimedRewards
                      : row.value;
        return value(b) - value(a) || a.address.localeCompare(b.address);
      })
      .map((row, index) => ({ ...row, rank: index + 1 }));
    return NextResponse.json({
      ok: true,
      ...all,
      selectedScope: scope,
      selectedMetric: metric,
      rows: selectedRows,
    });
  }
  const state = await getV4DevnetSnapshot();
  const achievements = deriveAchievements(state);
  const callers = new Map<
    string,
    {
      address: `0x${string}`;
      points: number;
      contributed: number;
      largest: number;
      captainWins: number;
      stockFlips: number;
      finalBells: number;
      claimedRewards: number;
    }
  >();
  for (const claim of state.claims) {
    const key = claim.claimant.address.toLowerCase();
    const current = callers.get(key) ?? {
      address: claim.claimant.address,
      points: 0,
      contributed: 0,
      largest: 0,
      captainWins: 0,
      stockFlips: 0,
      finalBells: 0,
      claimedRewards: 0,
    };
    current.points += claim.pointsAwarded ?? 0;
    current.contributed += claim.usdgAmount ?? 0;
    current.largest = Math.max(current.largest, claim.usdgAmount ?? 0);
    callers.set(key, current);
  }
  for (const achievement of achievements) {
    const current = callers.get(achievement.player.toLowerCase());
    if (!current) continue;
    if (achievement.kind === "STOCK_CAPTAIN") current.captainWins += 1;
    if (achievement.kind === "FLIP_ARTIST") current.stockFlips += 1;
    if (achievement.kind === "FINAL_CALLER") current.finalBells += 1;
  }
  const rows = [...callers.values()]
    .sort((a, b) => b.points - a.points)
    .map((row, index) => ({
      rank: index + 1,
      address: row.address,
      displayName: `caller-${row.address.slice(2, 7)}`,
      metric: "points",
      value: row.points,
      settledUsdgContributed: row.contributed,
      largestCall: row.largest,
      captainWins: row.captainWins,
      stockFlips: row.stockFlips,
      finalBells: row.finalBells,
      claimedRewards: row.claimedRewards,
    }));
  return NextResponse.json({
    ok: true,
    round: rows,
    season: rows,
    lifetime: rows,
    selectedScope: scope,
    selectedMetric: metric,
    rows: [...rows]
      .sort((a, b) => {
        const value = (row: typeof a) =>
          metric === "settled-volume"
            ? row.settledUsdgContributed
            : metric === "largest-call"
              ? row.largestCall
              : metric === "captain-wins"
                ? row.captainWins
                : metric === "stock-flips"
                  ? row.stockFlips
                  : metric === "final-bells"
                    ? row.finalBells
                    : metric === "claimed-rewards"
                      ? row.claimedRewards
                      : metric === "points"
                        ? row.value
                        : 0;
        return value(b) - value(a) || a.address.localeCompare(b.address);
      })
      .map((row, index) => ({ ...row, rank: index + 1 })),
    note: "Cancelled rounds are excluded when canonical settlement history is materialized.",
  });
}
