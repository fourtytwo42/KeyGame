import { NextResponse } from "next/server";
import { recordCompletedRun } from "@/lib/game/history";
import {
  ensureDevnetRoundProgression,
  getDevnetSession,
  getDevnetSnapshot,
} from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    let state = await getDevnetSnapshot();
    await recordCompletedRun(state);
    state = await ensureDevnetRoundProgression(state);
    const sessionState = await getDevnetSession();
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
