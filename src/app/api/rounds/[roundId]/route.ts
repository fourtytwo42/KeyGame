import { NextResponse } from "next/server";
import { getIndexedHistoricalRun } from "@/lib/server/indexed-history";
import { getDevnetSession, getDevnetSnapshot } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roundId: string }> },
) {
  const { roundId } = await params;
  const mode = process.env.NEXT_PUBLIC_GAME_MODE;
  if (mode === "testnet" || mode === "mainnet") {
    const indexed = await getIndexedHistoricalRun(roundId);
    if (!indexed) {
      return NextResponse.json(
        { ok: false, error: "Round is not indexed in this environment." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      roundId: indexed.roundId,
      projection: indexed.state,
      canonical: {
        chainId: indexed.state.chainId,
        contract: indexed.state.contractAddress,
        blockNumber: indexed.state.blockNumber,
      },
      parity: {
        status: "verified",
        checkedAt: new Date().toISOString(),
        source: "confirmed-indexer-and-direct-contract-reads",
      },
    });
  }
  let state: Awaited<ReturnType<typeof getDevnetSnapshot>>;
  try {
    state = await getDevnetSnapshot();
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Projection failed.",
      },
      { status: 503 },
    );
  }
  if (roundId !== state.roundId) {
    return NextResponse.json(
      { ok: false, error: "Round is not deployed in this environment." },
      { status: 404 },
    );
  }

  try {
    const sessionState = await getDevnetSession();
    return NextResponse.json({
      ok: true,
      roundId,
      projection: state,
      canonical: {
        chainId: state.chainId,
        contract: state.contractAddress,
        blockNumber: state.blockNumber,
      },
      parity: {
        status: "verified",
        checkedAt: new Date().toISOString(),
        source: "direct-rpc-and-canonical-events",
      },
      ...sessionState,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Projection failed.",
      },
      { status: 503 },
    );
  }
}
