import { describe, expect, it } from "vitest";
import type {
  DecodedV8Report,
  DecodedV10Report,
  Report,
} from "@chainlink/data-streams-sdk";
import { normalizeReport } from "./data-streams-adapter";

const feed = `0x0008${"11".repeat(30)}`;
const source: Report = {
  feedID: feed,
  fullReport: `0x${"22".repeat(64)}`,
  validFromTimestamp: 99,
  observationsTimestamp: 100,
};

describe("Data Streams normalization", () => {
  it("converts an 18-decimal V8 price to the contract's 8 decimals", () => {
    const decoded: DecodedV8Report = {
      version: "V8",
      nativeFee: 0n,
      linkFee: 0n,
      expiresAt: 103,
      midPrice: 123_456_789_010_000_000_000n,
      lastUpdateTimestamp: 100,
      marketStatus: 2,
    };
    expect(normalizeReport(source, decoded, 100).price).toBe(12_345_678_901n);
  });

  it("uses V10 tokenized price rather than raw underlying price", () => {
    const decoded: DecodedV10Report = {
      version: "V10",
      nativeFee: 0n,
      linkFee: 0n,
      expiresAt: 103,
      price: 200_000_000_000_000_000_000n,
      lastUpdateTimestamp: 100,
      marketStatus: 1,
      currentMultiplier: 500_000_000_000_000_000n,
      newMultiplier: 0n,
      activationDateTime: 0,
      tokenizedPrice: 100_000_000_000_000_000_000n,
    };
    expect(
      normalizeReport(
        { ...source, feedID: `0x000a${"11".repeat(30)}` },
        decoded,
        100,
      ).price,
    ).toBe(10_000_000_000n);
  });

  it("rejects reports older than the contract freshness window", () => {
    const decoded: DecodedV8Report = {
      version: "V8",
      nativeFee: 0n,
      linkFee: 0n,
      expiresAt: 200,
      midPrice: 1_000_000_000_000_000_000n,
      lastUpdateTimestamp: 100,
      marketStatus: 2,
    };
    expect(() => normalizeReport(source, decoded, 104)).toThrow("stale");
  });
});
