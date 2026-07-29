import { NextResponse } from "next/server";
import { getDevnetSnapshot } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getDevnetSnapshot();
    return NextResponse.json({
      ok: true,
      chainId: 31337,
      state,
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
