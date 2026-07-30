import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getCurrentRaid } from "@/lib/server/raids";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (process.env.NEXT_PUBLIC_GAME_MODE === "devnet") {
      return NextResponse.json({
        ok: true,
        campaign: {
          id: "devnet-preview",
          deploymentKey: "devnet-preview",
          state: "GATHERING",
          eligibleVoters: 0,
          threshold: 1,
          voteCount: 0,
          viewerEligible: false,
          viewerVoted: false,
          gatheringExpiresAt: new Date(
            Date.now() + 24 * 60 * 60 * 1_000,
          ).toISOString(),
        },
      });
    }
    const session = await getSession(request);
    const campaign = await getCurrentRaid(session?.address);
    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Raid signal unavailable.",
      },
      { status: 503 },
    );
  }
}
