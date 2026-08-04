import { NextResponse } from "next/server";
import { deriveHighlights } from "@/lib/game/highlights";
import { getHistoricalRun } from "@/lib/game/history";
import {
  getIndexedHistoricalRun,
  getIndexedHistoricalRunByRoundId,
} from "@/lib/server/indexed-history";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roundId: string }> },
) {
  const { roundId } = await params;
  const chainMode =
    process.env.NEXT_PUBLIC_GAME_MODE === "testnet" ||
    process.env.NEXT_PUBLIC_GAME_MODE === "mainnet";
  const run = chainMode
    ? ((await getIndexedHistoricalRun(roundId)) ??
      (await getIndexedHistoricalRunByRoundId(roundId)))
    : await getHistoricalRun(roundId);
  if (!run)
    return NextResponse.json(
      { ok: false, error: "Round not found." },
      { status: 404 },
    );
  return NextResponse.json({
    ok: true,
    roundId: run.roundId,
    highlights: deriveHighlights(run.state),
  });
}
