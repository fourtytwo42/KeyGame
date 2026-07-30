import { NextResponse } from "next/server";
import { tickerSlots } from "@/lib/game/constants";
import { screenRoster } from "@/lib/game/market-screen";
import type { ScreeningAsset } from "@/lib/game/types";
import { loadScreeningAssets } from "@/lib/server/market-store";

export const dynamic = "force-dynamic";

const devnetAssets = (): ScreeningAsset[] =>
  tickerSlots.map((ticker) => ({
    ticker: ticker.id,
    tokenAddress: ticker.tokenAddress!,
    marketId: ticker.marketId,
    dexMarket: {
      marketId: ticker.marketId!,
      poolAddress: ticker.tokenAddress!,
      stockTokenAddress: ticker.tokenAddress!,
      quoteTokenAddress: "0x0000000000000000000000000000000000000001",
      factoryAddress: "0x0000000000000000000000000000000000000002",
      feeTier: 3000,
      sourceChainId: 31337,
      twap: { seconds: 600, requiredHistorySeconds: 1800 },
      safety: {
        eligible: true,
        usdgDepth: 20_000,
        buyImpactBps: 50,
        sellImpactBps: 50,
        spotTwapDeviationBps: 5,
        sampleCount: 120,
        reasons: [],
      },
    },
    active: true,
    halted: false,
    canonical: true,
    dailyVolume: ticker.dailyVolume,
    samples: Array.from({ length: 120 }, (_, index) => ({
      timestamp: Math.floor(Date.now() / 1000) - (119 - index) * 15,
      price:
        ticker.openingPrice *
        (1 +
          ((index % 2 === 0 ? -1 : 1) * ticker.realizedMovementBps) /
            1_000_000),
    })),
  }));

export async function GET() {
  if (process.env.NEXT_PUBLIC_GAME_MODE === "devnet") {
    return NextResponse.json({ ok: true, ...screenRoster(devnetAssets()) });
  }

  if (process.env.DATABASE_URL) {
    try {
      const roster = screenRoster(await loadScreeningAssets());
      return NextResponse.json(
        { ok: !roster.delayed, ...roster },
        { status: roster.delayed ? 503 : 200 },
      );
    } catch {
      // The explicit adapter below remains a controlled fallback while the
      // local database is recovering.
    }
  }

  const adapterUrl = process.env.ROBINHOOD_MARKET_SCREEN_ADAPTER_URL;
  const adapterToken = process.env.ROBINHOOD_MARKET_SCREEN_ADAPTER_TOKEN;
  if (!adapterUrl || !adapterToken) {
    return NextResponse.json(
      { ok: false, error: "Market screening adapter is not configured." },
      { status: 503 },
    );
  }
  try {
    const response = await fetch(adapterUrl, {
      cache: "no-store",
      headers: { authorization: `Bearer ${adapterToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    const assets = (await response.json()) as ScreeningAsset[];
    if (!response.ok || !Array.isArray(assets)) {
      throw new Error("Malformed market-screen response.");
    }
    const roster = screenRoster(assets);
    return NextResponse.json(
      { ok: !roster.delayed, ...roster },
      { status: roster.delayed ? 503 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Market screening is unavailable.",
      },
      { status: 503 },
    );
  }
}
