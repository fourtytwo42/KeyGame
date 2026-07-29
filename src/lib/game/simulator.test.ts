import { describe, expect, it } from "vitest";
import { demoAddresses, roundConfig } from "./constants";
import { scenarios } from "./scenarios";
import { claimBell, leadingTicker, settle, tick } from "./simulator";

const claimant = {
  address: demoAddresses.player,
  displayName: "local.player",
  ticker: "AAPL" as const,
  band: "FLAT" as const,
  multiplierBps: 10_000,
  verifiedPrice: 214.17,
  reportTimestamp: 1_784_724_361,
  producerPass: false,
};

describe("Closing Print simulator", () => {
  it("moves into Rug Zone at ten seconds", () => {
    const result = tick({ ...scenarios.live.state, timeLeftSeconds: 11 }, 1);
    expect(result.phase).toBe("rug");
    expect(result.timeLeftSeconds).toBe(10);
  });

  it("never extends a claim during Rug Zone", () => {
    const result = claimBell(scenarios.rug.state, claimant);
    expect(result.event.accepted).toBe(true);
    expect(result.state.timeLeftSeconds).toBe(7);
    expect(result.state.potUsd).toBe(
      scenarios.rug.state.potUsd + roundConfig.claimPriceUsd,
    );
  });

  it("allows a different ticker on every accepted claim", () => {
    const result = claimBell(scenarios.live.state, claimant);
    expect(result.state.holder?.ticker).toBe("AAPL");
    expect(result.state.timeLeftSeconds).toBe(23);
  });

  it("locks the interval multiplier into weighted score", () => {
    const claimed = claimBell(scenarios.entry.state, {
      ...claimant,
      ticker: "NVDA",
      band: "GREEN",
      multiplierBps: 12_500,
    });
    const advanced = tick(claimed.state, 4);
    const nvda = advanced.tickerScores.find((score) => score.ticker === "NVDA");
    expect(nvda?.rawSeconds).toBe(4);
    expect(nvda?.weightedScore).toBe(5);
  });

  it("rejects self claims and unavailable reports before charging", () => {
    const self = claimBell(scenarios.live.state, {
      ...claimant,
      address: demoAddresses.caller,
    });
    const offline = claimBell(scenarios["dead-air"].state, claimant);
    expect(self.event.accepted).toBe(false);
    expect(offline.event.reason).toMatch(/unavailable/i);
    expect(offline.event.feeUsd).toBe(0);
  });

  it("enforces Producer Pass as binary special-round access", () => {
    const denied = claimBell(scenarios["special-round"].state, claimant);
    const allowed = claimBell(scenarios["special-round"].state, {
      ...claimant,
      producerPass: true,
    });
    expect(denied.event.accepted).toBe(false);
    expect(allowed.event.accepted).toBe(true);
  });

  it("freezes at zero before settlement", () => {
    const frozen = tick({ ...scenarios.rug.state, timeLeftSeconds: 1 }, 2);
    expect(frozen.phase).toBe("finalizing");
    expect(settle(frozen).phase).toBe("settled");
  });

  it("breaks weighted ties by most recent acquisition", () => {
    const tied = {
      ...scenarios.live.state,
      tickerScores: scenarios.live.state.tickerScores.map((score, index) => ({
        ...score,
        weightedScore: index < 2 ? 10 : 3,
        lastAcquisitionAt: index === 1 ? 20 : 10,
      })),
    };
    expect(leadingTicker(tied)).toBe("AAPL");
  });

  it("uses configured ticker order when all scores and times tie", () => {
    const tied = {
      ...scenarios.live.state,
      tickerScores: roundConfig.tickers.map((ticker) => ({
        ticker: ticker.id,
        rawSeconds: 0,
        weightedScore: 0,
        lastAcquisitionAt: 0,
        currentBand: "FLAT" as const,
        multiplierBps: 10_000,
      })),
    };
    expect(leadingTicker(tied)).toBe("NVDA");
  });
});
