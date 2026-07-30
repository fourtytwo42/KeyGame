import { NextResponse } from "next/server";
import { quoteV4Devnet } from "@/lib/web3/v4-devnet";
import type { TickerId } from "@/lib/game/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      ticker?: TickerId;
      amountUsd?: number;
      slippageBps?: number;
    };
    if (process.env.NEXT_PUBLIC_CONTRACT_VERSION !== "last-bell-v4-stock-pot") {
      return NextResponse.json(
        { ok: false, error: "Stock-pot quotes are not enabled." },
        { status: 409 },
      );
    }
    const quote = await quoteV4Devnet(
      body.ticker ?? "NVDA",
      body.amountUsd ?? 1,
      body.slippageBps ?? 100,
    );
    return NextResponse.json({ ok: true, quote });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Quote unavailable.",
      },
      { status: 400 },
    );
  }
}
