import { describe, expect, it } from "vitest";
import {
  assertReleaseCompilerConfiguration,
  DEPLOYABLE_CONTRACTS,
  EIP170_RUNTIME_LIMIT_BYTES,
  evaluateContractSize,
  PRODUCTION_RUNTIME_BUDGET_BYTES,
  validateContractSizeReport,
  type ContractSizeReport,
} from "./contract-size";

const hash = `0x${"a".repeat(64)}` as const;

function report(): ContractSizeReport {
  return {
    policyVersion: "contract-size-v1",
    profile: "release",
    sourceCommit: "b".repeat(40),
    generatedAt: "2026-08-03T00:00:00.000Z",
    foundryVersion: "forge 1.7.1",
    compiler: {
      solcVersion: "0.8.30",
      optimizerEnabled: true,
      optimizerRuns: 200,
      viaIR: true,
    },
    compilerConfigSha256: "c".repeat(64),
    limits: {
      eip170RuntimeBytes: EIP170_RUNTIME_LIMIT_BYTES,
      productionRuntimeBudgetBytes: PRODUCTION_RUNTIME_BUDGET_BYTES,
    },
    contracts: DEPLOYABLE_CONTRACTS.map((contract) =>
      evaluateContractSize({
        contractName: contract.name,
        tier: contract.tier,
        runtimeBytes: contract.name === "RoundManagerV4" ? 8_972 : 10_000,
        runtimeCodeHash: hash,
      }),
    ),
    passed: true,
  };
}

describe("release compiler and contract-size policy", () => {
  it("checks deployable runtime contracts but excludes local script contracts", () => {
    expect(DEPLOYABLE_CONTRACTS.map((contract) => contract.name)).toContain(
      "RoundManagerV4",
    );
    expect(
      DEPLOYABLE_CONTRACTS.some((contract) =>
        contract.name.startsWith("Deploy"),
      ),
    ).toBe(false);
  });

  it("accepts the pinned compiler and split manager with ample headroom", () => {
    expect(
      assertReleaseCompilerConfiguration({
        solc: "0.8.30",
        optimizer: true,
        optimizer_runs: 200,
        via_ir: true,
      }),
    ).toMatchObject({ optimizerRuns: 200, viaIR: true });
    expect(report().contracts[0]).toMatchObject({
      runtimeBytes: 8_972,
      eip170MarginBytes: 15_604,
      policyMarginBytes: 14_028,
      passed: true,
    });
  });

  it("rejects optimizer drift and wrong compiler settings", () => {
    expect(() =>
      assertReleaseCompilerConfiguration({
        solc: "0.8.30",
        optimizer: true,
        optimizer_runs: 10_000,
        via_ir: true,
      }),
    ).toThrow(/optimizer runs/);
    expect(() =>
      assertReleaseCompilerConfiguration({
        solc: "0.8.29",
        optimizer: true,
        optimizer_runs: 200,
        via_ir: false,
      }),
    ).toThrow(/solc/);
  });

  it("rejects production budget and EIP-170 violations", () => {
    expect(
      evaluateContractSize({
        contractName: "RoundManagerV4",
        tier: "production",
        runtimeBytes: 23_001,
        runtimeCodeHash: hash,
      }).passed,
    ).toBe(false);
    expect(
      evaluateContractSize({
        contractName: "MockUSDG",
        tier: "testnet",
        runtimeBytes: 24_577,
        runtimeCodeHash: hash,
      }).passed,
    ).toBe(false);
  });

  it("rejects incomplete, failed, or stale evidence", () => {
    const valid = report();
    expect(
      validateContractSizeReport(valid, {
        sourceCommit: valid.sourceCommit,
        compilerConfigSha256: valid.compilerConfigSha256,
      }),
    ).toEqual(valid);
    expect(() =>
      validateContractSizeReport({
        ...valid,
        contracts: valid.contracts.slice(1),
      }),
    ).toThrow(/incomplete/);
    expect(() =>
      validateContractSizeReport(valid, { sourceCommit: "d".repeat(40) }),
    ).toThrow(/stale/);
  });
});
