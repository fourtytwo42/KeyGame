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
    feedId: `0x${ticker.charCodeAt(0).toString(16).padStart(64, "0")}`,
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
    expect(result.mode).toBe("VERIFIED");
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
