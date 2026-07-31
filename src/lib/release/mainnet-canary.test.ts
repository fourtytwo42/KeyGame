import { describe, expect, it } from "vitest";
import {
  assertCanaryScope,
  canaryRoundSchedule,
  MAINNET_CANARY_BUDGET_RAW,
  MAINNET_CANARY_DURATION_MS,
  plannedCanarySpendRaw,
  validateCanaryActors,
} from "./mainnet-canary";
import type { MainnetReleaseAuthorization } from "./mainnet-v4";

const deployer = "0x1111111111111111111111111111111111111111";
const player = "0x2222222222222222222222222222222222222222";
const authorization = {
  walletUatDisposition: "SKIPPED_BY_OPERATOR",
} as MainnetReleaseAuthorization;

describe("mainnet canary controls", () => {
  it("distributes ten rounds through 24 hours below the 100 USDG budget", () => {
    const start = Date.parse("2026-07-31T00:00:00Z");
    const schedule = canaryRoundSchedule(start);
    expect(schedule).toHaveLength(10);
    expect(schedule[0].plannedAtMs).toBe(start);
    expect(schedule.at(-1)!.plannedAtMs).toBeLessThan(
      start + MAINNET_CANARY_DURATION_MS,
    );
    expect(plannedCanarySpendRaw()).toBe(82_000_000n);
    expect(plannedCanarySpendRaw()).toBeLessThan(MAINNET_CANARY_BUDGET_RAW);
  });

  it("requires one non-admin player and single-deployer role custody", () => {
    expect(
      validateCanaryActors({
        deployer,
        player,
        roles: [deployer, deployer, deployer, deployer, deployer],
      }),
    ).toEqual({ deployer, player });
    expect(() =>
      validateCanaryActors({ deployer, player: deployer, roles: [deployer] }),
    ).toThrow(/must differ/);
    expect(() =>
      validateCanaryActors({ deployer, player, roles: [deployer, player] }),
    ).toThrow(/privileged role/);
  });

  it("rejects round, budget, duration, and waiver violations", () => {
    const start = Date.parse("2026-07-31T00:00:00Z");
    expect(() =>
      assertCanaryScope({
        authorization,
        settledRounds: 11,
        spentRaw: 0n,
        startedAtMs: start,
        nowMs: start,
      }),
    ).toThrow(/round limit/);
    expect(() =>
      assertCanaryScope({
        authorization,
        settledRounds: 0,
        spentRaw: MAINNET_CANARY_BUDGET_RAW + 1n,
        startedAtMs: start,
        nowMs: start,
      }),
    ).toThrow(/budget/);
    expect(() =>
      assertCanaryScope({
        authorization,
        settledRounds: 0,
        spentRaw: 0n,
        startedAtMs: start,
        nowMs: start + MAINNET_CANARY_DURATION_MS + 1,
      }),
    ).toThrow(/expired/);
  });
});
