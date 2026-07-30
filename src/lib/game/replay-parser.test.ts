import { describe, expect, it } from "vitest";
import { parseVersionedReplay } from "./replay-parser";

describe("versioned replay parser", () => {
  it("preserves Closing Print events", () => {
    const parsed = parseVersionedReplay({
      contractVersion: "closing-print-v1",
      claims: [],
    });
    expect(parsed).toEqual([]);
  });

  it("preserves DEX source evidence", () => {
    const parsed = parseVersionedReplay({
      contractVersion: "closing-print-v2-dex",
      claims: [],
    });
    expect(parsed).toEqual([]);
  });

  it("preserves the v3 Crown and Airtime discriminator", () => {
    const parsed = parseVersionedReplay({
      contractVersion: "closing-print-v3-airtime",
      claims: [],
    });
    expect(parsed).toEqual([]);
  });

  it("normalizes legacy faction events without treating them as verified", () => {
    const parsed = parseVersionedReplay({
      contractVersion: "faction-v0",
      claims: [
        {
          id: "legacy-1",
          sequence: 1,
          acceptedAt: 8,
          player: "0x0000000000000000000000000000000000000001",
          faction: "NVDA",
          feeUsd: 1,
          potAfterUsd: 51,
          timeAfterSeconds: 44,
        },
      ],
    });
    expect(parsed[0].contractVersion).toBe("faction-v0");
    expect(parsed[0].claimant.ticker).toBe("NVDA");
    expect(parsed[0].verifiedPrice).toBe(0);
    expect(parsed[0].marketBand).toBe("FLAT");
  });
});
