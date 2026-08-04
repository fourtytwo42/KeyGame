import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getProfile } from "@/lib/server/profiles";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ identity: string }> },
) {
  try {
    const { identity } = await params;
    const [profile, session] = await Promise.all([
      getProfile(identity),
      getSession(request),
    ]);
    if (!profile) {
      return NextResponse.json(
        { ok: false, error: "Profile not found." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      ok: true,
      profile,
      viewerAuthenticated:
        session?.address.toLowerCase() === profile.address.toLowerCase(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Profile unavailable.",
      },
      { status: 503 },
    );
  }
}
