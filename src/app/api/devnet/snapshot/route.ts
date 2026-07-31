import { NextResponse } from "next/server";
import { recordCompletedRun } from "@/lib/game/history";
import { isV4DevnetRuntime } from "@/lib/server/runtime-deployment";
import {
  ensureDevnetRoundProgression,
  getDevnetSession,
  getDevnetSnapshot,
} from "@/lib/web3/devnet";
import {
  ensureV4DevnetRoundProgression,
  getV4DevnetSession,
  getV4DevnetSnapshot,
} from "@/lib/web3/v4-devnet-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (isV4DevnetRuntime()) {
      let state = await getV4DevnetSnapshot();
      await recordCompletedRun(state);
      state = await ensureV4DevnetRoundProgression(state);
      return NextResponse.json({
        ok: true,
        chainId: 31337,
        state,
        ...(await getV4DevnetSession()),
      });
    }
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
