import { NextResponse } from "next/server";
import { getSystemStatus } from "@/lib/server/system-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getSystemStatus());
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        mode: process.env.NEXT_PUBLIC_GAME_MODE || "simulator",
        error: error instanceof Error ? error.message : "Health check failed.",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
