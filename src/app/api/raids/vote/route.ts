import { NextResponse } from "next/server";
import { rateLimit, requireSession } from "@/lib/server/auth";
import { castRaidVote } from "@/lib/server/raids";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    await rateLimit("raid-vote", session.address.toLowerCase(), 5, 60);
    const campaign = await castRaidVote(session.address);
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Raid vote failed.",
      },
      { status: 400 },
    );
  }
}
