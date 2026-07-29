import { NextResponse } from "next/server";
import {
  getHistoricalRunSummaries,
  recordCompletedRun,
} from "@/lib/game/history";
import { getDevnetSnapshot } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (process.env.NEXT_PUBLIC_GAME_MODE === "devnet") {
      await recordCompletedRun(await getDevnetSnapshot());
    }
    return NextResponse.json({
      ok: true,
      runs: await getHistoricalRunSummaries(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Archive unavailable",
      },
      { status: 503 },
    );
  }
}
