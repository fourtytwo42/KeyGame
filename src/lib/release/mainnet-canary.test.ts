import { describe, expect, it } from "vitest";
import {
  assertCanaryScope,
  calculateMainnetGasBudget,
  canaryRoundSchedule,
  MAINNET_CANARY_BUDGET_RAW,
  MAINNET_CANARY_DURATION_MS,
  plannedCanarySpendRaw,
  plannedCanarySpendByActorRaw,
  restartCheckpointsForSettledRounds,
  validateCanaryActors,
} from "./mainnet-canary";
import type { MainnetReleaseAuthorization } from "./mainnet-v4";

const deployer = "0x1111111111111111111111111111111111111111";
const player = "0x2222222222222222222222222222222222222222";
const authorization = {
  walletUatDisposition: "SKIPPED_BY_OPERATOR",
} as MainnetReleaseAuthorization;

describe("mainnet canary controls", () => {
  it("distributes ten rounds from minute zero through minute 54", () => {
    const start = Date.parse("2026-07-31T00:00:00Z");
    const schedule = canaryRoundSchedule(start);
    expect(schedule).toHaveLength(10);
    expect(schedule[0].plannedAtMs).toBe(start);
    expect(
      schedule.map((entry) => (entry.plannedAtMs - start) / 60_000),
    ).toEqual([0, 6, 12, 18, 24, 30, 36, 42, 48, 54]);
    expect(MAINNET_CANARY_DURATION_MS).toBe(60 * 60 * 1_000);
    expect(plannedCanarySpendRaw()).toBe(82_000_000n);
    expect(plannedCanarySpendRaw()).toBeLessThan(MAINNET_CANARY_BUDGET_RAW);
  });

  it("schedules keeper and indexer restart checkpoints once", () => {
    expect(restartCheckpointsForSettledRounds(3)).toEqual([]);
    expect(restartCheckpointsForSettledRounds(4)).toEqual([
      { kind: "keeper", service: "v4-keeper", afterSettledRounds: 4 },
    ]);
    expect(restartCheckpointsForSettledRounds(7)).toEqual([
      { kind: "keeper", service: "v4-keeper", afterSettledRounds: 4 },
      { kind: "indexer", service: "chain-indexer", afterSettledRounds: 7 },
    ]);
  });

  it("budgets deployment, canary, conversion, margin, reserve, and actor spend", () => {
    expect(plannedCanarySpendByActorRaw()).toEqual({
      deployer: 39_000_000n,
      player: 43_000_000n,
    });
    expect(
      calculateMainnetGasBudget({
        gasPriceWei: 20_000_000n,
        reserveWei: 1n,
        playerReserveWei: 2n,
      }),
    ).toMatchObject({
      executionGas: 80_000_000n,
      marginBps: 2_500n,
      deployerExecutionWithMarginWei: 1_375_000_000_000_000n,
      playerExecutionWithMarginWei: 625_000_000_000_000n,
      requiredDeployerWei: 1_375_000_000_000_001n,
      requiredPlayerWei: 625_000_000_000_002n,
    });
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
