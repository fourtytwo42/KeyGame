import { NextResponse } from "next/server";
import { rateLimit, requireSession } from "@/lib/server/auth";
import { upsertProfile } from "@/lib/server/profiles";

export async function PUT(request: Request) {
  try {
    const session = await requireSession(request);
    await rateLimit("profile-write", session.address.toLowerCase(), 8, 60);
    const body = (await request.json()) as {
      handle?: unknown;
      displayName?: unknown;
      favoriteTicker?: unknown;
    };
    const profile = await upsertProfile(session.address, body);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Profile update failed.",
      },
      { status: 400 },
    );
  }
}
