import { getAddress, getContractAddress, type Address } from "viem";
import type {
  ContractSizeReport,
  ContractSizeTier,
  ReleaseCompilerConfiguration,
} from "./contract-size";
import {
  CONTRACT_SIZE_POLICY_VERSION,
  EIP170_RUNTIME_LIMIT_BYTES,
  PRODUCTION_RUNTIME_BUDGET_BYTES,
  RELEASE_FOUNDRY_PROFILE,
} from "./contract-size";

export const MAINNET_PLAN_SCHEMA_VERSION = 3 as const;

export type MainnetPlannedAddresses = {
  swapAdapter: Address;
  manager: Address;
  paymentRouter: Address;
  lifetimePointsVault: Address;
  roundFactory: Address;
  rewardRouter: Address;
  activeRound: Address;
};

export type PlannedMainnetDeploymentManifest = {
  planSchemaVersion: typeof MAINNET_PLAN_SCHEMA_VERSION;
  deploymentSchemaVersion: 5;
  environment: "robinhood-mainnet";
  chainId: 4663;
  sourceCommit: string;
  generatedAt: string;
  rpcPolicy: "LAN_ONLY";
  referenceUse: "HEALTH_CHECK_ONLY";
  automaticFailover: false;
  forkBlockNumber: string;
  forkBlockHash: `0x${string}`;
  deployerAddress: Address;
  deploymentNonce: string;
  approvedCatalogSize: number;
  expectedTransactionCount: number;
  simulatedDeploymentGas: string;
  expectedAddresses: MainnetPlannedAddresses;
  expectedRuntimeCodeHashes: Record<
    keyof MainnetPlannedAddresses,
    `0x${string}`
  >;
  expectedRuntimeCodeSizes: Record<keyof MainnetPlannedAddresses, number>;
  buildProvenance: {
    profile: typeof RELEASE_FOUNDRY_PROFILE;
    foundryVersion: string;
    compiler: ReleaseCompilerConfiguration;
    compilerConfigSha256: string;
    contractSizePolicyVersion: typeof CONTRACT_SIZE_POLICY_VERSION;
    eip170RuntimeLimitBytes: typeof EIP170_RUNTIME_LIMIT_BYTES;
    productionRuntimeBudgetBytes: typeof PRODUCTION_RUNTIME_BUDGET_BYTES;
    sizeReportSha256: string;
    contracts: Record<
      string,
      {
        tier: ContractSizeTier;
        runtimeBytes: number;
        runtimeCodeHash: `0x${string}`;
      }
    >;
  };
  constructorConfiguration: {
    factory: Address;
    usdg: Address;
    managerAdmin: Address;
    marketAdmin: Address;
    keeper: Address;
    treasury: Address;
    conversionOperator: Address;
    initialRoundId: string;
    startDurationSeconds: 300;
    extensionSeconds: 2;
    rugZoneSeconds: 10;
    hardCapSeconds: 600;
    heatTargetRawUsdg: "4000000000";
  };
  initialRoster: Array<{
    symbol: string;
    stockToken: Address;
    pool: Address;
    feeTier: number;
  }>;
  qualification: {
    testnetSourceCommit: string;
    testnetTwoRoundSmokePassed: true;
    testnetCurrentBytecodeMatches: true;
    internalSecurityReviewPassed: true;
    externalWalletUatStatus: "SKIPPED_BY_OPERATOR";
    browserWalletCompatibility: "UNVERIFIED";
    launchValidation: "READ_ONLY";
    promotionRequiresSeparateAuthorization: true;
  };
};

export function buildProvenanceFromSizeReport(
  report: ContractSizeReport,
  sizeReportSha256: string,
): PlannedMainnetDeploymentManifest["buildProvenance"] {
  if (!/^[0-9a-f]{64}$/i.test(sizeReportSha256)) {
    throw new Error("Contract-size report SHA-256 is malformed.");
  }
  return {
    profile: report.profile,
    foundryVersion: report.foundryVersion,
    compiler: report.compiler,
    compilerConfigSha256: report.compilerConfigSha256,
    contractSizePolicyVersion: report.policyVersion,
    eip170RuntimeLimitBytes: report.limits.eip170RuntimeBytes,
    productionRuntimeBudgetBytes: report.limits.productionRuntimeBudgetBytes,
    sizeReportSha256,
    contracts: Object.fromEntries(
      report.contracts.map((contract) => [
        contract.contractName,
        {
          tier: contract.tier,
          runtimeBytes: contract.runtimeBytes,
          runtimeCodeHash: contract.runtimeCodeHash,
        },
      ]),
    ),
  };
}

export function assertBuildProvenanceMatchesSizeReport(
  build: PlannedMainnetDeploymentManifest["buildProvenance"],
  report: ContractSizeReport,
  sizeReportSha256: string,
) {
  const expected = buildProvenanceFromSizeReport(report, sizeReportSha256);
  if (JSON.stringify(build) !== JSON.stringify(expected)) {
    throw new Error(
      "Planned build provenance differs from contract-size evidence.",
    );
  }
}

export function deriveMainnetPlannedAddresses(
  deployer: Address,
  deploymentNonce: bigint,
  catalogSize: number,
): { addresses: MainnetPlannedAddresses; expectedTransactionCount: number } {
  if (!Number.isInteger(catalogSize) || catalogSize < 4 || catalogSize > 16) {
    throw new Error("The production catalog must contain 4 to 16 markets.");
  }
  const sender = getAddress(deployer);
  const swapAdapter = getContractAddress({
    from: sender,
    nonce: deploymentNonce,
  });
  const managerNonce = deploymentNonce + 1n + BigInt(catalogSize);
  const manager = getContractAddress({ from: sender, nonce: managerNonce });
  const rewardRouter = getContractAddress({
    from: sender,
    nonce: managerNonce + 1n,
  });
  return {
    addresses: {
      swapAdapter,
      manager,
      paymentRouter: getContractAddress({ from: manager, nonce: 1n }),
      lifetimePointsVault: getContractAddress({ from: manager, nonce: 2n }),
      roundFactory: getContractAddress({ from: manager, nonce: 3n }),
      rewardRouter,
      activeRound: getContractAddress({
        from: getContractAddress({ from: manager, nonce: 3n }),
        nonce: 1n,
      }),
    },
    // Adapter creation, catalog writes, manager and reward-router creation,
    // guard configuration, round preparation, and round activation.
    expectedTransactionCount: catalogSize + 6,
  };
}

export function validatePlannedMainnetDeployment(
  input: unknown,
  expected?: {
    sourceCommit?: string;
    deployerAddress?: Address;
    deploymentNonce?: bigint;
  },
): PlannedMainnetDeploymentManifest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Planned mainnet deployment must be a JSON object.");
  }
  const value = input as PlannedMainnetDeploymentManifest;
  if (
    value.planSchemaVersion !== MAINNET_PLAN_SCHEMA_VERSION ||
    value.deploymentSchemaVersion !== 5 ||
    value.environment !== "robinhood-mainnet" ||
    value.chainId !== 4663
  ) {
    throw new Error("Planned deployment schema or chain is invalid.");
  }
  const build = value.buildProvenance;
  if (
    build?.profile !== RELEASE_FOUNDRY_PROFILE ||
    build.contractSizePolicyVersion !== CONTRACT_SIZE_POLICY_VERSION ||
    build.eip170RuntimeLimitBytes !== EIP170_RUNTIME_LIMIT_BYTES ||
    build.productionRuntimeBudgetBytes !== PRODUCTION_RUNTIME_BUDGET_BYTES ||
    build.compiler?.solcVersion !== "0.8.30" ||
    build.compiler.optimizerEnabled !== true ||
    build.compiler.optimizerRuns !== 200 ||
    build.compiler.viaIR !== true ||
    !/^[0-9a-f]{64}$/i.test(build.compilerConfigSha256) ||
    !/^[0-9a-f]{64}$/i.test(build.sizeReportSha256)
  ) {
    throw new Error("Planned deployment build provenance is invalid.");
  }
  if (!/^[0-9a-f]{40}$/i.test(value.sourceCommit)) {
    throw new Error("Planned deployment source commit is malformed.");
  }
  if (!/^\d+$/.test(value.deploymentNonce)) {
    throw new Error("Planned deployment nonce is malformed.");
  }
  if (
    !/^\d+$/.test(value.simulatedDeploymentGas) ||
    BigInt(value.simulatedDeploymentGas) === 0n
  ) {
    throw new Error("Planned simulated deployment gas is malformed.");
  }
  if (
    value.rpcPolicy !== "LAN_ONLY" ||
    value.referenceUse !== "HEALTH_CHECK_ONLY" ||
    value.automaticFailover !== false
  ) {
    throw new Error("Planned deployment violates the LAN-only RPC policy.");
  }
  if (value.initialRoster.length !== 4) {
    throw new Error(
      "Planned deployment must contain exactly four initial markets.",
    );
  }
  const rosterSymbols = new Set(value.initialRoster.map((item) => item.symbol));
  const rosterTokens = new Set(
    value.initialRoster.map((item) => getAddress(item.stockToken)),
  );
  if (rosterSymbols.size !== 4 || rosterTokens.size !== 4) {
    throw new Error("Planned initial roster contains duplicates.");
  }
  const derived = deriveMainnetPlannedAddresses(
    getAddress(value.deployerAddress),
    BigInt(value.deploymentNonce),
    value.approvedCatalogSize,
  );
  for (const [name, address] of Object.entries(derived.addresses)) {
    if (
      getAddress(
        value.expectedAddresses[name as keyof MainnetPlannedAddresses],
      ) !== getAddress(address)
    ) {
      throw new Error(
        `Planned ${name} address does not match the deployer nonce.`,
      );
    }
    const codeHash =
      value.expectedRuntimeCodeHashes[name as keyof MainnetPlannedAddresses];
    if (!/^0x[0-9a-f]{64}$/i.test(codeHash)) {
      throw new Error(`Planned ${name} runtime hash is malformed.`);
    }
  }
  const runtimeContractByAddress = {
    swapAdapter: "RobinhoodStockSwapAdapter",
    manager: "RoundManagerV4",
    paymentRouter: "PaymentRouter",
    lifetimePointsVault: "LifetimePointsVault",
    roundFactory: "RoundFactoryV5",
    rewardRouter: "RewardRouterV4",
    activeRound: "LastBellRoundV4",
  } as const;
  for (const [addressName, contractName] of Object.entries(
    runtimeContractByAddress,
  )) {
    const contract = build.contracts?.[contractName];
    const expectedHash =
      value.expectedRuntimeCodeHashes[
        addressName as keyof MainnetPlannedAddresses
      ];
    if (
      !contract ||
      contract.tier !== "production" ||
      contract.runtimeBytes > PRODUCTION_RUNTIME_BUDGET_BYTES ||
      value.expectedRuntimeCodeSizes[
        addressName as keyof MainnetPlannedAddresses
      ] !== contract.runtimeBytes ||
      !/^0x[0-9a-f]{64}$/i.test(expectedHash)
    ) {
      throw new Error(
        `Planned ${contractName} runtime size does not match build provenance.`,
      );
    }
  }
  if (value.expectedTransactionCount !== derived.expectedTransactionCount) {
    throw new Error("Planned deployment transaction count is invalid.");
  }
  const role = getAddress(value.deployerAddress);
  for (const configured of [
    value.constructorConfiguration.managerAdmin,
    value.constructorConfiguration.marketAdmin,
    value.constructorConfiguration.keeper,
    value.constructorConfiguration.treasury,
    value.constructorConfiguration.conversionOperator,
  ]) {
    if (getAddress(configured) !== role) {
      throw new Error("Planned privileged roles must use the deployer EOA.");
    }
  }
  if (
    value.qualification.testnetTwoRoundSmokePassed !== true ||
    value.qualification.testnetCurrentBytecodeMatches !== true ||
    value.qualification.internalSecurityReviewPassed !== true ||
    value.qualification.externalWalletUatStatus !== "SKIPPED_BY_OPERATOR" ||
    value.qualification.browserWalletCompatibility !== "UNVERIFIED" ||
    value.qualification.launchValidation !== "READ_ONLY" ||
    value.qualification.promotionRequiresSeparateAuthorization !== true
  ) {
    throw new Error("Planned deployment qualification gates are incomplete.");
  }
  if (expected?.sourceCommit && value.sourceCommit !== expected.sourceCommit) {
    throw new Error("Planned deployment source commit mismatch.");
  }
  if (
    expected?.deployerAddress &&
    getAddress(value.deployerAddress) !== getAddress(expected.deployerAddress)
  ) {
    throw new Error("Planned deployment deployer mismatch.");
  }
  if (
    expected?.deploymentNonce !== undefined &&
    BigInt(value.deploymentNonce) !== expected.deploymentNonce
  ) {
    throw new Error("Planned deployment nonce is no longer current.");
  }
  return value;
}
