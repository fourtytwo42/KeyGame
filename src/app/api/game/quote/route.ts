import { NextResponse } from "next/server";
import {
  isV4DevnetRuntime,
  isV4Runtime,
} from "@/lib/server/runtime-deployment";
import { quoteV4Production } from "@/lib/server/v4-production";
import { quoteV4Devnet } from "@/lib/web3/v4-devnet-runtime";
import type { TickerId } from "@/lib/game/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      ticker?: TickerId;
      amountUsd?: number;
      slippageBps?: number;
    };
    if (!isV4Runtime()) {
      return NextResponse.json(
        { ok: false, error: "Stock-pot quotes are not enabled." },
        { status: 409 },
      );
    }
    const quote = isV4DevnetRuntime()
      ? await quoteV4Devnet(
          body.ticker ?? "NVDA",
          body.amountUsd ?? 1,
          body.slippageBps ?? 10_000,
        )
      : await quoteV4Production(
          body.ticker ?? "NVDA",
          body.amountUsd ?? 1,
          body.slippageBps ?? 10_000,
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
