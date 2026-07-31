import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import {
  getV4DevnetRewards,
  getV4DevnetSnapshot,
} from "@/lib/web3/v4-devnet-runtime";
import { isV4DevnetRuntime } from "@/lib/server/runtime-deployment";
import { getV4ProductionRewardHistory } from "@/lib/server/v4-production";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ address: string }> },
) {
  const { address } = await context.params;
  if (!isAddress(address)) {
    return NextResponse.json(
      { ok: false, error: "Invalid address." },
      { status: 400 },
    );
  }
  const player = address as Address;
  if (!isV4DevnetRuntime()) {
    return NextResponse.json({
      ok: true,
      ...(await getV4ProductionRewardHistory(player)),
    });
  }
  const [state, rewards] = await Promise.all([
    getV4DevnetSnapshot(),
    getV4DevnetRewards(player),
  ]);
  const contributions = state.claims
    .filter(
      (claim) => claim.claimant.address.toLowerCase() === player.toLowerCase(),
    )
    .map((claim) => ({
      roundId: state.roundId,
      ticker: claim.claimant.ticker,
      usdgAmount: claim.usdgAmount,
      stockReceived: claim.stockReceived,
      multiplierBps: claim.multiplierBps,
      points: claim.pointsAwarded,
      transactionHash: claim.transactionHash,
      contractVersion: "last-bell-v4-stock-pot",
    }));
  return NextResponse.json({ ok: true, contributions, rewards });
}
