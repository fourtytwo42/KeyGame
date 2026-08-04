import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertSmokeReconciliationScope,
  calculateTestnetGasBudget,
  parseTestnetSmokeAuthorization,
  smokeRoundLimitReached,
  validateFinalTestnetSmokeEvidence,
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

  it("allows one unstarted successor and rejects extra, incomplete, or cancelled rounds", () => {
    expect(() =>
      assertSmokeReconciliationScope({
        totalRounds: 3,
        settledRounds: 2,
        cancelledRounds: 0,
        unstartedSuccessorRounds: 1,
      }),
    ).not.toThrow();
    expect(() =>
      assertSmokeReconciliationScope({
        totalRounds: 2,
        settledRounds: 1,
        cancelledRounds: 1,
        unstartedSuccessorRounds: 0,
      }),
    ).toThrow(/no cancellations/);
    expect(() =>
      assertSmokeReconciliationScope({
        totalRounds: 3,
        settledRounds: 2,
        cancelledRounds: 0,
        unstartedSuccessorRounds: 0,
      }),
    ).toThrow(/unstarted successor/);
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
    expect(deploy).toContain("--resume --broadcast --verify");
    expect(preflight).not.toMatch(/\n\s*--broadcast(?:\s|$)/);
  });

  it("includes v4 reads in UAT testnet but not protected mainnet builds", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain('process.env.NEXT_PUBLIC_GAME_MODE === "testnet"');
    expect(config).toContain(
      'process.env.NEXT_PUBLIC_UAT_WALLET_ENABLED === "true"',
    );
    expect(config).not.toMatch(
      /NEXT_PUBLIC_GAME_MODE === "mainnet"[\s\S]{0,120}v4-devnet\.ts/,
    );
    const runtime = readFileSync("src/lib/web3/v4-devnet.ts", "utf8");
    expect(runtime).toContain("fromBlock: deploymentBlock");
    expect(runtime).not.toContain("fromBlock: 0n");
  });

  it("uses the statically inlined game mode in the client presentation", () => {
    const liveGame = readFileSync("src/components/live-game.tsx", "utf8");
    expect(liveGame).toContain("const gameMode = publicEnvironment.mode");
    expect(liveGame).not.toContain(
      'process.env.NEXT_PUBLIC_GAME_MODE || "simulator"',
    );
  });

  it("routes historical v4 replays through the production-safe reader", () => {
    const snapshot = readFileSync("src/lib/web3/live-snapshot.ts", "utf8");
    expect(snapshot).toContain('reportedVersion === "last-bell-v4-stock-pot"');
    expect(snapshot).toContain("return getV4LiveSnapshot(roundAddress)");
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

  it("freezes only a current-bytecode, exactly-two-round smoke", () => {
    const manifestSha256 = "d".repeat(64);
    const manifest = {
      chainId: 46630,
      mockOnly: true,
      contractVersion: "saved-bell-v5-market-pot",
      sourceCommit: commit,
    };
    const bytecode = {
      allMatch: true,
      candidateSourceCommit: commit,
      deployedSourceCommit: commit,
      manifestSha256,
      additionalTransactionsSubmitted: 0,
      comparisons: [
        "RoundManagerV4",
        "RoundFactoryV5",
        "PaymentRouter",
        "LifetimePointsVault",
        "RewardRouterV4",
        "MockStockSwapAdapter",
        "LastBellRoundV4",
        "MockUSDG",
        "MockStockToken0",
        "MockStockToken1",
        "MockStockToken2",
        "MockStockToken3",
      ].map((name) => ({
        name,
        match: true,
      })),
    };
    const reconciliation = {
      ok: true,
      chainId: 46630,
      sourceCommit: commit,
      manifestHash: manifestSha256,
      authorizationScope: { maxDeployments: 1, maxSettledRounds: 2 },
      scope: {
        totalRounds: 3,
        settledRounds: 2,
        cancelledRounds: 0,
        unstartedSuccessorRounds: 1,
      },
      failedKeeperJobs: "0",
      contributionSummaries: [
        { round: "1", players: "2" },
        { round: "2", players: "2" },
      ],
      allocations: Array.from({ length: 10 }, (_, index) => ({ index })),
      rewardClaims: [
        { category: "LAST_BELL" },
        { category: "WINNING_STOCK" },
        { category: "LIFETIME" },
      ],
    };
    expect(
      validateFinalTestnetSmokeEvidence({
        expectedCommit: commit,
        manifest,
        bytecode,
        reconciliation,
      }),
    ).toMatchObject({
      sourceCommit: commit,
      settledRounds: 2,
      unstartedSuccessorRounds: 1,
      currentBytecodeMatches: true,
    });
    expect(() =>
      validateFinalTestnetSmokeEvidence({
        expectedCommit: commit,
        manifest,
        bytecode: { ...bytecode, allMatch: false },
        reconciliation,
      }),
    ).toThrow(/bytecode/);
    expect(() =>
      validateFinalTestnetSmokeEvidence({
        expectedCommit: commit,
        manifest,
        bytecode,
        reconciliation: {
          ...reconciliation,
          scope: { ...reconciliation.scope, totalRounds: 2 },
        },
      }),
    ).toThrow(/scope/);
  });

  it("accepts an unchanged deployed contract set from an earlier smoke commit", () => {
    const deployedCommit = "e".repeat(40);
    const manifestSha256 = "f".repeat(64);
    const result = validateFinalTestnetSmokeEvidence({
      expectedCommit: commit,
      manifest: {
        chainId: 46630,
        mockOnly: true,
        contractVersion: "saved-bell-v5-market-pot",
        sourceCommit: deployedCommit,
      },
      bytecode: {
        allMatch: true,
        candidateSourceCommit: commit,
        deployedSourceCommit: deployedCommit,
        manifestSha256,
        additionalTransactionsSubmitted: 0,
        comparisons: [
          "RoundManagerV4",
          "RoundFactoryV5",
          "PaymentRouter",
          "LifetimePointsVault",
          "RewardRouterV4",
          "MockStockSwapAdapter",
          "LastBellRoundV4",
          "MockUSDG",
          "MockStockToken0",
          "MockStockToken1",
          "MockStockToken2",
          "MockStockToken3",
        ].map((name) => ({
          name,
          match: true,
        })),
      },
      reconciliation: {
        ok: true,
        chainId: 46630,
        sourceCommit: deployedCommit,
        manifestHash: manifestSha256,
        authorizationScope: { maxDeployments: 1, maxSettledRounds: 2 },
        scope: {
          totalRounds: 3,
          settledRounds: 2,
          cancelledRounds: 0,
          unstartedSuccessorRounds: 1,
        },
        failedKeeperJobs: "0",
        contributionSummaries: [
          { round: "1", players: "2" },
          { round: "2", players: "2" },
        ],
        allocations: Array.from({ length: 10 }, (_, index) => ({ index })),
        rewardClaims: [
          { category: "LAST_BELL" },
          { category: "WINNING_STOCK" },
          { category: "LIFETIME" },
        ],
      },
    });
    expect(result).toMatchObject({
      sourceCommit: commit,
      testnetSourceCommit: deployedCommit,
      currentBytecodeMatches: true,
    });
  });
});
