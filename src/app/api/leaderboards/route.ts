import { NextResponse } from "next/server";
import { getV4DevnetSnapshot } from "@/lib/web3/v4-devnet-runtime";
import { isV4DevnetRuntime } from "@/lib/server/runtime-deployment";
import { getV4ProductionLeaderboards } from "@/lib/server/v4-production";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isV4DevnetRuntime()) {
    return NextResponse.json({
      ok: true,
      ...(await getV4ProductionLeaderboards()),
    });
  }
  const state = await getV4DevnetSnapshot();
  const callers = new Map<
    string,
    {
      address: `0x${string}`;
      points: number;
      contributed: number;
      largest: number;
    }
  >();
  for (const claim of state.claims) {
    const key = claim.claimant.address.toLowerCase();
    const current = callers.get(key) ?? {
      address: claim.claimant.address,
      points: 0,
      contributed: 0,
      largest: 0,
    };
    current.points += claim.pointsAwarded ?? 0;
    current.contributed += claim.usdgAmount ?? 0;
    current.largest = Math.max(current.largest, claim.usdgAmount ?? 0);
    callers.set(key, current);
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
    }));
  return NextResponse.json({
    ok: true,
    round: rows,
    season: rows,
    lifetime: rows,
    note: "Cancelled rounds are excluded when canonical settlement history is materialized.",
  });
}
