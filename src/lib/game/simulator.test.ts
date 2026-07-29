import { describe, expect, it } from "vitest";
import { demoAddresses, roundConfig } from "./constants";
import { scenarios } from "./scenarios";
import { claimBell, leadingFaction, settle, tick } from "./simulator";

describe("Last Bell simulator", () => {
  it("moves into Rug Zone at ten seconds", () => {
    const result = tick({ ...scenarios.live.state, timeLeftSeconds: 11 }, 1);
    expect(result.phase).toBe("rug");
    expect(result.timeLeftSeconds).toBe(10);
  });

  it("never extends a claim during Rug Zone", () => {
    const result = claimBell(scenarios.rug.state, {
      address: demoAddresses.player,
      displayName: "local.player",
      faction: "AAPL",
    });
    expect(result.event.accepted).toBe(true);
    expect(result.state.timeLeftSeconds).toBe(7);
    expect(result.state.potUsd).toBe(
      scenarios.rug.state.potUsd + roundConfig.claimPriceUsd,
    );
  });

  it("adds two seconds to normal live claims without crossing the hard cap", () => {
    const result = claimBell(scenarios.live.state, {
      address: demoAddresses.player,
      displayName: "local.player",
      faction: "AAPL",
    });
    expect(result.state.timeLeftSeconds).toBe(23);
  });

  it("rejects self claims and offline claims", () => {
    const self = claimBell(scenarios.live.state, {
      address: demoAddresses.caller,
      displayName: "bellboy.eth",
      faction: "NVDA",
    });
    const offline = claimBell(scenarios["dead-air"].state, {
      address: demoAddresses.player,
      displayName: "local.player",
      faction: "AAPL",
    });
    expect(self.event.accepted).toBe(false);
    expect(offline.event.reason).toMatch(/unavailable/i);
  });

  it("freezes at zero before settlement", () => {
    const frozen = tick({ ...scenarios.rug.state, timeLeftSeconds: 1 }, 2);
    expect(frozen.phase).toBe("finalizing");
    expect(frozen.timeLeftSeconds).toBe(0);
    expect(settle(frozen).phase).toBe("settled");
  });

  it("uses deterministic faction tie breaking", () => {
    const tied = {
      ...scenarios.live.state,
      airtime: [
        { faction: "TSLA" as const, seconds: 10 },
        { faction: "AAPL" as const, seconds: 10 },
        { faction: "SPY" as const, seconds: 3 },
        { faction: "NVDA" as const, seconds: 2 },
      ],
    };
    expect(leadingFaction(tied)).toBe("AAPL");
  });

  it("uses contract faction order when every faction is tied at zero", () => {
    const tiedAtZero = {
      ...scenarios.live.state,
      airtime: roundConfig.factions.map((faction) => ({
        faction: faction.id,
        seconds: 0,
      })),
    };
    expect(leadingFaction(tiedAtZero)).toBe("NVDA");
  });
});
