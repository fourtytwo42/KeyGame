import { describe, expect, it } from "vitest";
import {
  assertBuildProvenanceMatchesSizeReport,
  buildProvenanceFromSizeReport,
  deriveMainnetPlannedAddresses,
  validatePlannedMainnetDeployment,
} from "./mainnet-deployment-plan";
import {
  DEPLOYABLE_CONTRACTS,
  EIP170_RUNTIME_LIMIT_BYTES,
  evaluateContractSize,
  PRODUCTION_RUNTIME_BUDGET_BYTES,
  type ContractSizeReport,
} from "./contract-size";

const deployer = "0x1111111111111111111111111111111111111111" as const;
const derived = deriveMainnetPlannedAddresses(deployer, 7n, 5);
const runtimeHashes = Object.fromEntries(
  Object.keys(derived.addresses).map((name) => [name, `0x${"a".repeat(64)}`]),
);
const sizeReport: ContractSizeReport = {
  policyVersion: "contract-size-v1",
  profile: "release",
  sourceCommit: "b".repeat(40),
  generatedAt: "2026-08-03T00:00:00Z",
  foundryVersion: "forge 1.7.1",
  compiler: {
    solcVersion: "0.8.30",
    optimizerEnabled: true,
    optimizerRuns: 200,
    viaIR: true,
  },
  compilerConfigSha256: "d".repeat(64),
  limits: {
    eip170RuntimeBytes: EIP170_RUNTIME_LIMIT_BYTES,
    productionRuntimeBudgetBytes: PRODUCTION_RUNTIME_BUDGET_BYTES,
  },
  contracts: DEPLOYABLE_CONTRACTS.map((contract) =>
    evaluateContractSize({
      contractName: contract.name,
      tier: contract.tier,
      runtimeBytes: contract.name === "RoundManagerV4" ? 8_972 : 10_000,
      runtimeCodeHash: `0x${"a".repeat(64)}`,
    }),
  ),
  passed: true,
};
const plan = {
  planSchemaVersion: 3,
  deploymentSchemaVersion: 5,
  environment: "robinhood-mainnet",
  chainId: 4663,
  sourceCommit: "b".repeat(40),
  generatedAt: "2026-08-01T00:00:00Z",
  rpcPolicy: "LAN_ONLY",
  referenceUse: "HEALTH_CHECK_ONLY",
  automaticFailover: false,
  forkBlockNumber: "22814522",
  forkBlockHash: `0x${"c".repeat(64)}`,
  deployerAddress: deployer,
  deploymentNonce: "7",
  approvedCatalogSize: 5,
  expectedTransactionCount: derived.expectedTransactionCount,
  simulatedDeploymentGas: "12000000",
  expectedAddresses: derived.addresses,
  expectedRuntimeCodeHashes: runtimeHashes,
  expectedRuntimeCodeSizes: {
    swapAdapter: 10_000,
    manager: 8_972,
    paymentRouter: 10_000,
    lifetimePointsVault: 10_000,
    roundFactory: 10_000,
    rewardRouter: 10_000,
    activeRound: 10_000,
  },
  buildProvenance: buildProvenanceFromSizeReport(sizeReport, "e".repeat(64)),
  constructorConfiguration: {
    factory: "0x2222222222222222222222222222222222222222",
    usdg: "0x3333333333333333333333333333333333333333",
    managerAdmin: deployer,
    marketAdmin: deployer,
    keeper: deployer,
    treasury: deployer,
    conversionOperator: deployer,
    initialRoundId: "1",
    startDurationSeconds: 300,
    extensionSeconds: 2,
    rugZoneSeconds: 10,
    hardCapSeconds: 600,
    heatTargetRawUsdg: "4000000000",
  },
  initialRoster: ["AAPL", "NVDA", "SPY", "TSLA"].map((symbol, index) => ({
    symbol,
    stockToken: `0x${(index + 4).toString(16).repeat(40)}`,
    pool: `0x${["8", "9", "a", "b"][index].repeat(40)}`,
    feeTier: symbol === "NVDA" ? 500 : 3000,
  })),
  qualification: {
    testnetSourceCommit: "5955b3b8f47c6294bd7549215d0099741474ab23",
    testnetTwoRoundSmokePassed: true,
    testnetCurrentBytecodeMatches: true,
    internalSecurityReviewPassed: true,
    externalWalletUatStatus: "SKIPPED_BY_OPERATOR",
    browserWalletCompatibility: "UNVERIFIED",
    launchValidation: "READ_ONLY",
    promotionRequiresSeparateAuthorization: true,
  },
};

describe("planned mainnet deployment", () => {
  it("derives every CREATE address from the deployer nonce", () => {
    expect(derived.expectedTransactionCount).toBe(11);
    expect(
      validatePlannedMainnetDeployment(plan, {
        sourceCommit: "b".repeat(40),
        deployerAddress: deployer,
        deploymentNonce: 7n,
      }).expectedAddresses,
    ).toEqual(derived.addresses);
  });

  it("rejects changed nonces, addresses, qualification, and RPC policy", () => {
    expect(() =>
      validatePlannedMainnetDeployment(plan, { deploymentNonce: 8n }),
    ).toThrow(/nonce/);
    expect(() =>
      validatePlannedMainnetDeployment({
        ...plan,
        expectedAddresses: { ...plan.expectedAddresses, manager: deployer },
      }),
    ).toThrow(/manager address/);
    expect(() =>
      validatePlannedMainnetDeployment({
        ...plan,
        automaticFailover: true,
      }),
    ).toThrow(/LAN-only/);
    expect(() =>
      validatePlannedMainnetDeployment({
        ...plan,
        qualification: {
          ...plan.qualification,
          browserWalletCompatibility: "VERIFIED",
        },
      }),
    ).toThrow(/qualification/);
    expect(() =>
      validatePlannedMainnetDeployment({
        ...plan,
        buildProvenance: {
          ...plan.buildProvenance,
          compiler: { ...plan.buildProvenance.compiler, optimizerRuns: 10_000 },
        },
      }),
    ).toThrow(/build provenance/);
    expect(() =>
      validatePlannedMainnetDeployment({
        ...plan,
        buildProvenance: {
          ...plan.buildProvenance,
          contracts: {
            ...plan.buildProvenance.contracts,
            RoundManagerV4: {
              ...plan.buildProvenance.contracts.RoundManagerV4,
              runtimeCodeHash: `0x${"f".repeat(64)}`,
            },
          },
        },
      }),
    ).not.toThrow();
    expect(() =>
      assertBuildProvenanceMatchesSizeReport(
        {
          ...plan.buildProvenance,
          contracts: {
            ...plan.buildProvenance.contracts,
            RoundManagerV4: {
              ...plan.buildProvenance.contracts.RoundManagerV4,
              runtimeCodeHash: `0x${"f".repeat(64)}`,
            },
          },
        },
        sizeReport,
        "e".repeat(64),
      ),
    ).toThrow(/differs/);
    expect(() =>
      validatePlannedMainnetDeployment({
        ...plan,
        expectedRuntimeCodeSizes: {
          ...plan.expectedRuntimeCodeSizes,
          manager: 22_452,
        },
      }),
    ).toThrow(/runtime size/);
  });
});
