import { describe, expect, it } from "vitest";
import {
  assertRehearsalScope,
  rehearsalRoundSchedule,
  DEVNET_REHEARSAL_BUDGET_RAW,
  DEVNET_REHEARSAL_DURATION_MS,
  plannedRehearsalSpendRaw,
  plannedRehearsalSpendByActorRaw,
  rehearsalGasLimit,
  restartCheckpointsForSettledRounds,
  validateRehearsalActors,
} from "./launch-rehearsal";
const operator = "0x1111111111111111111111111111111111111111";
const playerA = "0x2222222222222222222222222222222222222222";
const playerB = "0x3333333333333333333333333333333333333333";

describe("devnet launch rehearsal controls", () => {
  it("adds a conservative gas limit margin", () => {
    expect(rehearsalGasLimit(481_887n)).toBe(602_359n);
    expect(() => rehearsalGasLimit(0n)).toThrow(/positive/);
  });

  it("distributes ten rounds from minute zero through minute 54", () => {
    const start = Date.parse("2026-07-31T00:00:00Z");
    const schedule = rehearsalRoundSchedule(start);
    expect(schedule).toHaveLength(10);
    expect(schedule[0].plannedAtMs).toBe(start);
    expect(
      schedule.map((entry) => (entry.plannedAtMs - start) / 60_000),
    ).toEqual([0, 6, 12, 18, 24, 30, 36, 42, 48, 54]);
    expect(DEVNET_REHEARSAL_DURATION_MS).toBe(60 * 60 * 1_000);
    expect(plannedRehearsalSpendRaw()).toBe(82_000_000n);
    expect(plannedRehearsalSpendRaw()).toBeLessThan(
      DEVNET_REHEARSAL_BUDGET_RAW,
    );
  });

  it("schedules keeper and indexer restart checkpoints once", () => {
    expect(restartCheckpointsForSettledRounds(3)).toEqual([]);
    expect(restartCheckpointsForSettledRounds(4)).toEqual([
      {
        kind: "keeper",
        service: "v4-devnet-keeper",
        afterSettledRounds: 4,
      },
    ]);
    expect(restartCheckpointsForSettledRounds(7)).toEqual([
      {
        kind: "keeper",
        service: "v4-devnet-keeper",
        afterSettledRounds: 4,
      },
      { kind: "indexer", service: "chain-indexer", afterSettledRounds: 7 },
    ]);
  });

  it("preserves the exact 82 USDG actor schedule", () => {
    expect(plannedRehearsalSpendByActorRaw()).toEqual({
      deployer: 39_000_000n,
      player: 43_000_000n,
    });
  });

  it("requires two distinct non-admin players", () => {
    expect(
      validateRehearsalActors({
        operator,
        playerA,
        playerB,
        roles: [operator, operator, operator, operator, operator],
      }),
    ).toEqual({ operator, playerA, playerB });
    expect(() =>
      validateRehearsalActors({
        operator,
        playerA: operator,
        playerB,
        roles: [operator],
      }),
    ).toThrow(/distinct/);
    expect(() =>
      validateRehearsalActors({
        operator,
        playerA,
        playerB,
        roles: [operator, playerA],
      }),
    ).toThrow(/privileged role/);
  });

  it("rejects chain, round, budget, and duration violations", () => {
    const start = Date.parse("2026-07-31T00:00:00Z");
    expect(() =>
      assertRehearsalScope({
        chainId: 31_337,
        settledRounds: 11,
        spentRaw: 0n,
        startedAtMs: start,
        nowMs: start,
      }),
    ).toThrow(/round limit/);
    expect(() =>
      assertRehearsalScope({
        chainId: 31_337,
        settledRounds: 0,
        spentRaw: DEVNET_REHEARSAL_BUDGET_RAW + 1n,
        startedAtMs: start,
        nowMs: start,
      }),
    ).toThrow(/budget/);
    expect(() =>
      assertRehearsalScope({
        chainId: 31_337,
        settledRounds: 0,
        spentRaw: 0n,
        startedAtMs: start,
        nowMs: start + DEVNET_REHEARSAL_DURATION_MS + 1,
      }),
    ).toThrow(/expired/);
    expect(() =>
      assertRehearsalScope({
        chainId: 4_663,
        settledRounds: 0,
        spentRaw: 0n,
        startedAtMs: start,
        nowMs: start,
      }),
    ).toThrow(/31337/);
  });
});
