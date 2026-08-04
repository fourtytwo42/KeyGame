import { describe, expect, it } from "vitest";
import { scenarios } from "./scenarios";
import {
  buildStorySummary,
  contributionShortcuts,
  deriveAchievements,
  deriveHighlights,
  deriveTickerCaptains,
  heatLevel,
  phasePresentation,
  transactionStageFor,
} from "./highlights";

describe("v4 presentation derivation", () => {
  it("labels the existing heat curve", () => {
    expect(heatLevel(10_000)).toBe("COLD");
    expect(heatLevel(12_500)).toBe("WARMING");
    expect(heatLevel(15_000)).toBe("COOKING");
    expect(heatLevel(20_000)).toBe("NUCLEAR");
  });

  it("selects captains by points, latest call, then address", () => {
    const state = structuredClone(scenarios.live.state);
    const claim = state.claims[0];
    state.claims = [
      {
        ...claim,
        id: "a",
        claimant: {
          ...claim.claimant,
          address: "0x0000000000000000000000000000000000000002",
          ticker: "NVDA",
        },
        pointsAwarded: 100,
        atSeconds: 5,
      },
      {
        ...claim,
        id: "b",
        claimant: {
          ...claim.claimant,
          address: "0x0000000000000000000000000000000000000001",
          ticker: "NVDA",
        },
        pointsAwarded: 100,
        atSeconds: 6,
      },
    ];
    expect(deriveTickerCaptains(state)[0].address).toBe(
      "0x0000000000000000000000000000000000000001",
    );
  });

  it("emits each milestone once and only from accepted calls", () => {
    const state = structuredClone(scenarios.live.state);
    const claim = state.claims[0];
    state.claims = [
      { ...claim, id: "one", potAfterUsd: 1_500, accepted: true },
      { ...claim, id: "two", potAfterUsd: 2_000, accepted: true },
      { ...claim, id: "three", potAfterUsd: 12_000, accepted: false },
    ];
    expect(
      deriveHighlights(state)
        .filter((item) => item.kind === "POT_MILESTONE")
        .map((item) => item.amountUsd),
    ).toEqual([1_000]);
  });

  it("derives nonfinancial settled achievements and story copy", () => {
    const state = structuredClone(scenarios.settled.state);
    const achievements = deriveAchievements(state);
    expect(achievements.some((item) => item.kind === "FINAL_CALLER")).toBe(
      true,
    );
    expect(achievements.some((item) => item.kind === "BIGGEST_APE")).toBe(true);
    expect(buildStorySummary(state)).toContain("POT");
  });

  it("gives Rug Zone a distinct truthful phase", () => {
    expect(phasePresentation(scenarios.rug.state).tone).toBe("rug");
    expect(phasePresentation(scenarios.rug.state).message).toContain(
      "Last accepted call wins 50%",
    );
  });

  it("calculates contribution shortcuts without imposing a ceiling", () => {
    expect(contributionShortcuts(1_000, 15_000)).toEqual({
      matchLeader: 667,
      takeTheLead: 668,
      flipTheStock: 701,
    });
    expect(contributionShortcuts(0, 10_000).matchLeader).toBe(1);
  });

  it.each([
    ["approving", "idle", true, true, false, "APPROVAL_PENDING"],
    ["claiming", "idle", true, true, false, "CONTRIBUTION_PENDING"],
    ["idle", "submitted", false, true, false, "WAITING_FOR_WALLET"],
    ["idle", "submitted", true, true, false, "CONTRIBUTION_PENDING"],
    ["idle", "accepted", true, true, false, "ACCEPTED_ONCHAIN"],
    ["idle", "rejected", true, true, false, "REJECTED_NOTHING_CHARGED"],
    ["idle", "idle", true, true, false, "READY"],
  ] as const)(
    "maps %s/%s into the explicit transaction stage",
    (
      walletAction,
      actionStatus,
      connected,
      chainMode,
      devnetMode,
      expected,
    ) => {
      expect(
        transactionStageFor({
          walletAction,
          actionStatus,
          connected,
          chainMode,
          devnetMode,
        }),
      ).toBe(expected);
    },
  );
});
