import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getCurrentRaid } from "@/lib/server/raids";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
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
