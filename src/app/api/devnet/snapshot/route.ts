import { NextResponse } from "next/server";
import { recordCompletedRun } from "@/lib/game/history";
import { getDevnetSession, getDevnetSnapshot } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [state, sessionState] = await Promise.all([
      getDevnetSnapshot(),
      getDevnetSession(),
    ]);
    await recordCompletedRun(state);
    return NextResponse.json({
      ok: true,
      chainId: 31337,
      state,
      ...sessionState,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        chainId: 31337,
        error: error instanceof Error ? error.message : "Unknown devnet error",
      },
      { status: 503 },
    );
  }
}
