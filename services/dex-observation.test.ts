import { describe, expect, it } from "vitest";
import { ROBINHOOD_USDG } from "../src/lib/game/dex-config";
import { meanTick, stockPriceFromTick } from "./dex-observation";

describe("DEX TWAP observation math", () => {
  it("rounds negative arithmetic mean ticks toward negative infinity", () => {
    expect(meanTick([0n, 0n, -601n])).toBe(-2);
  });

  it("quotes USDG per stock for either pool token ordering", () => {
    const stockBelowUsdg =
      "0x0000000000000000000000000000000000000001" as const;
    const stockAboveUsdg =
      "0xffffffffffffffffffffffffffffffffffffffff" as const;
    expect(stockBelowUsdg.toLowerCase() < ROBINHOOD_USDG.toLowerCase()).toBe(
      true,
    );
    expect(stockPriceFromTick(-230_000, stockBelowUsdg)).toBeGreaterThan(0);
    expect(stockPriceFromTick(230_000, stockAboveUsdg)).toBeGreaterThan(0);
  });
});
