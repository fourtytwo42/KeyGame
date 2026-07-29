import { NextResponse } from "next/server";
import { tickerSlots } from "@/lib/game/constants";
import type { TickerId } from "@/lib/game/types";
import { createMockMarketReport } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ticker = new URL(request.url).searchParams.get("ticker");
  if (!tickerSlots.some((slot) => slot.id === ticker)) {
    return NextResponse.json(
      { ok: false, error: "Unknown ticker." },
      { status: 400 },
    );
  }

  if (process.env.NEXT_PUBLIC_GAME_MODE === "devnet") {
    try {
      return NextResponse.json({
        ok: true,
        ...(await createMockMarketReport(ticker as TickerId)),
        source: "mock-verifier",
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "The market report is unavailable.",
        },
        { status: 503 },
      );
    }
  }

  const adapterUrl = process.env.DATA_STREAMS_REPORT_ADAPTER_URL;
  const adapterToken = process.env.DATA_STREAMS_REPORT_ADAPTER_TOKEN;
  if (!adapterUrl || !adapterToken) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Signed Data Streams acquisition is not configured for this deployment.",
      },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(
      `${adapterUrl}?ticker=${encodeURIComponent(ticker!)}`,
      {
        cache: "no-store",
        headers: { authorization: `Bearer ${adapterToken}` },
        signal: AbortSignal.timeout(2_500),
      },
    );
    const payload = (await upstream.json()) as {
      report?: string;
      price?: number;
      observedAt?: number;
      band?: string;
      multiplierBps?: number;
      error?: string;
    };
    if (
      !upstream.ok ||
      !/^0x[0-9a-fA-F]+$/.test(payload.report ?? "") ||
      !Number.isFinite(payload.price) ||
      !Number.isInteger(payload.observedAt)
    ) {
      throw new Error(payload.error || "Malformed signed report response.");
    }
    return NextResponse.json({
      ok: true,
      ticker,
      tickerIndex: tickerSlots.findIndex((slot) => slot.id === ticker),
      source: "chainlink-data-streams",
      ...payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Signed market data is unavailable.",
      },
      { status: 503 },
    );
  }
}
