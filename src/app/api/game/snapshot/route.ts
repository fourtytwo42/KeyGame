import { NextResponse } from "next/server";
import {
  getDevnetSession,
  getDevnetSnapshot,
} from "@/lib/web3/devnet";
import { getLiveSnapshot } from "@/lib/web3/live-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const mode = process.env.NEXT_PUBLIC_GAME_MODE || "simulator";
  try {
    if (mode === "devnet") {
      return NextResponse.json({
        ok: true,
        chainId: 31337,
        state: await getDevnetSnapshot(),
        ...(await getDevnetSession()),
      });
    }
    if (mode !== "testnet" && mode !== "mainnet") {
      return NextResponse.json(
        { ok: false, error: "Simulator mode has no chain snapshot." },
        { status: 409 },
      );
    }
    const state = await getLiveSnapshot();
    return NextResponse.json({ ok: true, chainId: state.chainId, state });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "The live tape is unavailable.",
      },
      { status: 503 },
    );
  }
}
