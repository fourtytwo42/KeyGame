import { NextResponse } from "next/server";
import { isAddress, type Address } from "viem";
import { buildPlayerRoundProjection } from "@/lib/game/projections";
import { loadServerDeployment } from "@/lib/server/deployment";
import { deploymentPublicClient } from "@/lib/server/rpc-client";
import { getLiveSnapshot } from "@/lib/web3/live-snapshot";
import { lastBellAbi } from "@/lib/web3/last-bell-abi";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: rawAddress } = await params;
  if (!isAddress(rawAddress)) {
    return NextResponse.json(
      { ok: false, error: "A valid wallet address is required." },
      { status: 400 },
    );
  }
  try {
    const address = rawAddress as Address;
    const state = await getLiveSnapshot();
    if (!state.contractAddress) {
      throw new Error("The active round is unavailable.");
    }
    const manifest = await loadServerDeployment();
    const client = deploymentPublicClient(manifest);
    const [raw, weighted, creditedTickerRaw] = await Promise.all([
      Promise.all(
        [0, 1, 2, 3].map((index) =>
          client.readContract({
            address: state.contractAddress!,
            abi: lastBellAbi,
            functionName: "playerTickerAirtime",
            args: [address, index],
          }),
        ),
      ),
      Promise.all(
        [0, 1, 2, 3].map((index) =>
          client.readContract({
            address: state.contractAddress!,
            abi: lastBellAbi,
            functionName: "playerTickerScore",
            args: [address, index],
          }),
        ),
      ),
      Promise.all(
        [0, 1, 2, 3].map((index) =>
          client.readContract({
            address: state.contractAddress!,
            abi: lastBellAbi,
            functionName: "tickerAirtime",
            args: [index],
          }),
        ),
      ),
    ]);
    const holderTickerIndex = state.holder
      ? state.tickerScores.findIndex(
          (score) => score.ticker === state.holder?.ticker,
        )
      : -1;
    const pendingRawSeconds =
      holderTickerIndex >= 0
        ? Math.max(
            0,
            state.tickerScores[holderTickerIndex].rawSeconds -
              Number(creditedTickerRaw[holderTickerIndex]),
          )
        : 0;
    return NextResponse.json({
      ok: true,
      projection: buildPlayerRoundProjection({
        state,
        address,
        rawAirtime: raw.map(Number),
        weightedPoints: weighted.map((value) => Number(value) / 10_000),
        pendingRawSeconds,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Projection unavailable.",
      },
      { status: 503 },
    );
  }
}
