import { describe, expect, it } from "vitest";
import {
  MIN_COMPLETE_SAMPLES,
  realizedMovementBps,
  screenRoster,
} from "./market-screen";
import type { ScreeningAsset } from "./types";

const makeAsset = (
  ticker: string,
  options: Partial<ScreeningAsset> & { movement?: number } = {},
): ScreeningAsset => {
  const movement = options.movement ?? 1;
  return {
    ticker,
    tokenAddress: `0x${ticker.charCodeAt(0).toString(16).padStart(40, "0")}`,
    marketId: `0x${ticker.charCodeAt(0).toString(16).padStart(64, "0")}`,
    dexMarket: {
      marketId: `0x${ticker.charCodeAt(0).toString(16).padStart(64, "0")}`,
      poolAddress: `0x${ticker.charCodeAt(0).toString(16).padStart(40, "0")}`,
      stockTokenAddress: `0x${ticker.charCodeAt(0).toString(16).padStart(40, "0")}`,
      quoteTokenAddress: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      factoryAddress: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
      feeTier: 3000,
      sourceChainId: 4663,
      twap: { seconds: 600, requiredHistorySeconds: 1800 },
      safety: {
        eligible: true,
        usdgDepth: 20_000,
        buyImpactBps: 50,
        sellImpactBps: 50,
        spotTwapDeviationBps: 5,
        sampleCount: MIN_COMPLETE_SAMPLES,
        reasons: [],
      },
    },
    active: true,
    halted: false,
    canonical: true,
    dailyVolume: 100,
    samples: Array.from({ length: MIN_COMPLETE_SAMPLES }, (_, index) => ({
      timestamp: index * 15,
      price: 100 + (index % 2 === 0 ? 0 : movement),
    })),
    ...options,
  } as ScreeningAsset;
};

describe("Closing Print roster screening", () => {
  it("ranks complete verified streams by realized movement", () => {
    const result = screenRoster([
      makeAsset("AAPL", { movement: 1 }),
      makeAsset("TSLA", { movement: 4 }),
      makeAsset("NVDA", { movement: 3 }),
      makeAsset("SPY", { movement: 2 }),
    ]);
    expect(result.mode).toBe("DEX");
    expect(result.label).toBe("HEAT CHECK");
    expect(result.selected.map((asset) => asset.ticker)).toEqual([
      "TSLA",
      "NVDA",
      "SPY",
      "AAPL",
    ]);
  });

  it("uses volume then symbol as deterministic ties", () => {
    const result = screenRoster([
      makeAsset("TSLA", { dailyVolume: 100 }),
      makeAsset("AAPL", { dailyVolume: 200 }),
      makeAsset("NVDA", { dailyVolume: 100 }),
      makeAsset("SPY", { dailyVolume: 100 }),
    ]);
    expect(result.selected.map((asset) => asset.ticker)).toEqual([
      "AAPL",
      "NVDA",
      "SPY",
      "TSLA",
    ]);
  });

  it("falls back to active canonical volume when streams are incomplete", () => {
    const assets = ["NVDA", "AAPL", "TSLA", "SPY"].map((ticker, index) =>
      makeAsset(ticker, {
        dailyVolume: index + 1,
        samples: [],
      }),
    );
    const result = screenRoster(assets);
    expect(result.mode).toBe("FLAT");
    expect(result.selected[0].ticker).toBe("SPY");
  });

  it("excludes halted and inactive assets and delays below four", () => {
    const result = screenRoster([
      makeAsset("NVDA"),
      makeAsset("AAPL"),
      makeAsset("TSLA", { halted: true }),
      makeAsset("SPY", { active: false }),
    ]);
    expect(result.delayed).toBe(true);
    expect(result.selected).toEqual([]);
  });

  it("sums absolute sample-to-sample basis point returns", () => {
    expect(
      Math.round(
        realizedMovementBps([
          { timestamp: 0, price: 100 },
          { timestamp: 15, price: 101 },
          { timestamp: 30, price: 100 },
        ]),
      ),
    ).toBe(199);
  });
});
