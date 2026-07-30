import { describe, expect, it } from "vitest";
import { scenarios } from "./scenarios";
import {
  buildPlayerRoundProjection,
  buildRoundProjection,
  projectedWinningTicker,
} from "./projections";

describe("round projections", () => {
  it("projects holder and Closing Print pools without replacing settlement", () => {
    const projection = buildRoundProjection(scenarios.live.state);
    expect(projection.finalHolder).toBe(scenarios.live.state.holder?.address);
    expect(projection.holderPoolUsd).toBe(44.5);
    expect(projection.closingPrintPoolUsd).toBe(26.7);
    expect(projection.currentEarning?.pointsPerSecond).toBe(1.25);
    expect(projection.isEstimate).toBe(true);
  });

  it("uses latest acquisition then configured order for score ties", () => {
    expect(
      projectedWinningTicker([
        {
          ticker: "A",
          rawSeconds: 2,
          weightedScore: 2,
          lastAcquisitionAt: 1,
          currentBand: "FLAT",
          multiplierBps: 10_000,
        },
        {
          ticker: "B",
          rawSeconds: 2,
          weightedScore: 2,
          lastAcquisitionAt: 2,
          currentBand: "FLAT",
          multiplierBps: 10_000,
        },
      ]),
    ).toBe("B");
  });

  it("adds only the current player's pending interval", () => {
    const state = structuredClone(scenarios.live.state);
    const projection = buildPlayerRoundProjection({
      state,
      address: state.holder!.address,
      rawAirtime: [10, 0, 0, 0],
      weightedPoints: [12.5, 0, 0, 0],
      pendingRawSeconds: 4,
    });
    expect(projection.perTicker[0].rawAirtimeSeconds).toBe(14);
    expect(projection.perTicker[0].pendingWeightedPoints).toBe(5);
    expect(projection.projectedHolderRewardUsd).toBe(44.5);
    expect(projection.projectedTotalRewardUsd).toBeGreaterThan(44.5);
  });

  it("keeps FLAT estimates truthful", () => {
    const projection = buildRoundProjection(scenarios.flat.state);
    expect(
      projection.estimatedBands.every((band) => band.band === "FLAT"),
    ).toBe(true);
    expect(
      projection.estimatedBands.every((band) => band.multiplierBps === 10_000),
    ).toBe(true);
  });

  it("projects a live pot even when pre-settlement pool fields are zero", () => {
    const state = structuredClone(scenarios.live.state);
    state.potUsd = 1.21;
    state.pools = {
      holderUsd: 0,
      closingPrintUsd: 0,
      nextRoundUsd: 0,
      protocolUsd: 0,
    };
    const projection = buildRoundProjection(state);
    expect(projection.holderPoolUsd).toBeCloseTo(0.605);
    expect(projection.closingPrintPoolUsd).toBeCloseTo(0.363);
  });

  it("stops showing a live earning rate after settlement", () => {
    expect(
      buildRoundProjection(scenarios.settled.state).currentEarning,
    ).toBeNull();
  });
});
