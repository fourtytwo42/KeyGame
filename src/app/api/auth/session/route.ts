import { NextResponse } from "next/server";
import {
  getSession,
  requireSameOrigin,
  revokeSession,
} from "@/lib/server/auth";

export async function GET(request: Request) {
  return NextResponse.json({ ok: true, session: await getSession(request) });
}

export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    await revokeSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Sign-out failed.",
      },
      { status: 400 },
    );
  }
}
