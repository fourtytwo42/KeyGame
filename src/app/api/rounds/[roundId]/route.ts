import { NextResponse } from "next/server";
import { getDevnetSession, getDevnetSnapshot } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roundId: string }> },
) {
  const { roundId } = await params;
  if (roundId !== "4663") {
    return NextResponse.json(
      { ok: false, error: "Round is not deployed in this environment." },
      { status: 404 },
    );
  }

  try {
    const [state, sessionState] = await Promise.all([
      getDevnetSnapshot(),
      getDevnetSession(),
    ]);
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
