import { describe, expect, it } from "vitest";
import {
  deriveMainnetPlannedAddresses,
  validatePlannedMainnetDeployment,
} from "./mainnet-deployment-plan";

const deployer = "0x1111111111111111111111111111111111111111" as const;
const derived = deriveMainnetPlannedAddresses(deployer, 7n, 5);
const runtimeHashes = Object.fromEntries(
  Object.keys(derived.addresses).map((name) => [name, `0x${"a".repeat(64)}`]),
);
const plan = {
  planSchemaVersion: 1,
  deploymentSchemaVersion: 4,
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
  constructorConfiguration: {
    factory: "0x2222222222222222222222222222222222222222",
    usdg: "0x3333333333333333333333333333333333333333",
    managerAdmin: deployer,
    marketAdmin: deployer,
    keeper: deployer,
    treasury: deployer,
    conversionOperator: deployer,
    initialRoundId: "1",
    startDurationSeconds: 45,
    extensionSeconds: 2,
    rugZoneSeconds: 10,
    hardCapSeconds: 180,
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
  });
});
