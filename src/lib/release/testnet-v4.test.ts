import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertSmokeReconciliationScope,
  calculateTestnetGasBudget,
  parseTestnetSmokeAuthorization,
  smokeRoundLimitReached,
} from "./testnet-v4";

const commit = "4e04f5f21a62476703600d332a6eb442b6fb185b";
const authorization = [
  `sourceCommit=${commit}`,
  "twoRoundSmokeAuthorized=true",
  "chainId=46630",
  "maxDeployments=1",
  "maxSettledRounds=2",
].join("\n");

describe("testnet v4 release guards", () => {
  it("accepts only the exact one-deployment two-round authorization", () => {
    expect(parseTestnetSmokeAuthorization(authorization, commit)).toEqual({
      sourceCommit: commit,
      twoRoundSmokeAuthorized: true,
      chainId: 46630,
      maxDeployments: 1,
      maxSettledRounds: 2,
    });
    expect(() =>
      parseTestnetSmokeAuthorization(
        authorization.replace(commit, "0".repeat(40)),
        commit,
      ),
    ).toThrow(/does not match/);
    expect(() =>
      parseTestnetSmokeAuthorization(
        authorization.replace("maxSettledRounds=2", "maxSettledRounds=3"),
        commit,
      ),
    ).toThrow(/exactly two/);
  });

  it("budgets deployment and smoke gas with margin and reserve", () => {
    const budget = calculateTestnetGasBudget({
      balanceWei: 7_858_463_990_000_000n,
      deploymentGas: 20_012_786n,
      smokeGas: 10_000_000n,
      gasPriceWei: 20_000_001n,
      reserveWei: 1_000_000_000_000_000n,
    });
    expect(budget.requiredWei).toBe(1_720_306_900_015_344n);
    expect(budget.sufficient).toBe(true);
    expect(budget.headroomWei).toBe(6_138_157_089_984_656n);
  });

  it("fails closed when the balance is below the calculated requirement", () => {
    const budget = calculateTestnetGasBudget({
      balanceWei: 1_000n,
      deploymentGas: 20_012_786n,
      smokeGas: 10_000_000n,
      gasPriceWei: 20_000_001n,
      reserveWei: 1_000_000_000_000_000n,
    });
    expect(budget.sufficient).toBe(false);
  });

  it("stops lifecycle preparation after the second round", () => {
    expect(smokeRoundLimitReached(1n, 1n, 2)).toBe(false);
    expect(smokeRoundLimitReached(2n, 1n, 2)).toBe(true);
    expect(() => smokeRoundLimitReached(2n, 1n, 3)).toThrow(/exactly two/);
  });

  it("rejects extra, incomplete, or cancelled smoke rounds", () => {
    expect(() =>
      assertSmokeReconciliationScope({
        totalRounds: 3,
        settledRounds: 2,
        cancelledRounds: 0,
      }),
    ).toThrow(/exactly two/);
    expect(() =>
      assertSmokeReconciliationScope({
        totalRounds: 2,
        settledRounds: 1,
        cancelledRounds: 1,
      }),
    ).toThrow(/no cancellations/);
  });

  it("pins the configured deployer sender in simulation and broadcast", () => {
    const preflight = readFileSync("scripts/preflight-testnet-v4.sh", "utf8");
    const deploy = readFileSync("scripts/deploy-testnet-v4.sh", "utf8");
    expect(preflight).toContain('--sender "$DEPLOYER_ADDRESS"');
    expect(deploy).toContain('--sender "$DEPLOYER_ADDRESS"');
    expect(deploy).toContain('--keystore "$KEYGAME_DEPLOYER_KEYSTORE"');
    expect(deploy).toContain(
      '--password-file "$KEYGAME_DEPLOYER_PASSWORD_FILE"',
    );
    expect(preflight).not.toMatch(/\n\s*--broadcast(?:\s|$)/);
  });

  it("keeps wrong-chain, unlocked-RPC, credential, and duplicate guards", () => {
    const preflight = readFileSync("scripts/preflight-testnet-v4.sh", "utf8");
    const deploy = readFileSync("scripts/deploy-testnet-v4.sh", "utf8");
    expect(preflight).toContain('== "46630"');
    expect(preflight).toContain("eth_accounts");
    expect(preflight).toContain("KEYGAME_DEPLOYER_PASSWORD_FILE");
    expect(preflight).toContain('deployer_balance" -ge "$required_balance');
    expect(deploy).toContain("A v4 testnet manifest already exists");
    expect(deploy).toContain("validate-testnet-v4-authorization.ts");
  });
});
