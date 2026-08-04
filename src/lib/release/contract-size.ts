export const CONTRACT_SIZE_POLICY_VERSION = "contract-size-v1" as const;
export const RELEASE_FOUNDRY_PROFILE = "release" as const;
export const RELEASE_SOLC_VERSION = "0.8.30" as const;
export const RELEASE_OPTIMIZER_RUNS = 200 as const;
export const EIP170_RUNTIME_LIMIT_BYTES = 24_576 as const;
export const PRODUCTION_RUNTIME_BUDGET_BYTES = 23_000 as const;

export const DEPLOYABLE_CONTRACTS = [
  { name: "RoundManagerV4", tier: "production" },
  { name: "RoundFactoryV5", tier: "production" },
  { name: "LastBellRoundV4", tier: "production" },
  { name: "LifetimePointsVault", tier: "production" },
  { name: "RewardRouterV4", tier: "production" },
  { name: "PaymentRouter", tier: "production" },
  { name: "RobinhoodStockSwapAdapter", tier: "production" },
  { name: "MockStockSwapAdapter", tier: "testnet" },
  { name: "MockUSDG", tier: "testnet" },
  { name: "MockStockToken", tier: "testnet" },
] as const;

export type ContractSizeTier = (typeof DEPLOYABLE_CONTRACTS)[number]["tier"];

export type ReleaseCompilerConfiguration = {
  solcVersion: typeof RELEASE_SOLC_VERSION;
  optimizerEnabled: true;
  optimizerRuns: typeof RELEASE_OPTIMIZER_RUNS;
  viaIR: true;
};

export type ContractSizeEntry = {
  contractName: string;
  tier: ContractSizeTier;
  runtimeBytes: number;
  runtimeCodeHash: `0x${string}`;
  maximumBytes: number;
  eip170MarginBytes: number;
  policyMarginBytes: number;
  passed: boolean;
};

export type ContractSizeReport = {
  policyVersion: typeof CONTRACT_SIZE_POLICY_VERSION;
  profile: typeof RELEASE_FOUNDRY_PROFILE;
  sourceCommit: string;
  generatedAt: string;
  foundryVersion: string;
  compiler: ReleaseCompilerConfiguration;
  compilerConfigSha256: string;
  limits: {
    eip170RuntimeBytes: typeof EIP170_RUNTIME_LIMIT_BYTES;
    productionRuntimeBudgetBytes: typeof PRODUCTION_RUNTIME_BUDGET_BYTES;
  };
  contracts: ContractSizeEntry[];
  passed: boolean;
};

type ForgeConfiguration = {
  solc?: unknown;
  optimizer?: unknown;
  optimizer_runs?: unknown;
  via_ir?: unknown;
};

export function assertReleaseCompilerConfiguration(
  input: ForgeConfiguration,
): ReleaseCompilerConfiguration {
  if (input.solc !== RELEASE_SOLC_VERSION) {
    throw new Error(
      `Release solc must be ${RELEASE_SOLC_VERSION}; received ${String(input.solc)}.`,
    );
  }
  if (input.optimizer !== true) {
    throw new Error("Release optimizer must be enabled.");
  }
  if (input.optimizer_runs !== RELEASE_OPTIMIZER_RUNS) {
    throw new Error(
      `Release optimizer runs must be ${RELEASE_OPTIMIZER_RUNS}; received ${String(input.optimizer_runs)}.`,
    );
  }
  if (input.via_ir !== true) {
    throw new Error("Release via_ir must be enabled.");
  }
  return {
    solcVersion: RELEASE_SOLC_VERSION,
    optimizerEnabled: true,
    optimizerRuns: RELEASE_OPTIMIZER_RUNS,
    viaIR: true,
  };
}

export function evaluateContractSize(input: {
  contractName: string;
  tier: ContractSizeTier;
  runtimeBytes: number;
  runtimeCodeHash: `0x${string}`;
}): ContractSizeEntry {
  const maximumBytes =
    input.tier === "production"
      ? PRODUCTION_RUNTIME_BUDGET_BYTES
      : EIP170_RUNTIME_LIMIT_BYTES;
  return {
    ...input,
    maximumBytes,
    eip170MarginBytes: EIP170_RUNTIME_LIMIT_BYTES - input.runtimeBytes,
    policyMarginBytes: maximumBytes - input.runtimeBytes,
    passed:
      Number.isInteger(input.runtimeBytes) &&
      input.runtimeBytes >= 0 &&
      input.runtimeBytes <= maximumBytes &&
      input.runtimeBytes <= EIP170_RUNTIME_LIMIT_BYTES,
  };
}

export function validateContractSizeReport(
  input: unknown,
  expected?: { sourceCommit?: string; compilerConfigSha256?: string },
): ContractSizeReport {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Contract-size evidence must be a JSON object.");
  }
  const report = input as ContractSizeReport;
  if (
    report.policyVersion !== CONTRACT_SIZE_POLICY_VERSION ||
    report.profile !== RELEASE_FOUNDRY_PROFILE ||
    report.limits?.eip170RuntimeBytes !== EIP170_RUNTIME_LIMIT_BYTES ||
    report.limits?.productionRuntimeBudgetBytes !==
      PRODUCTION_RUNTIME_BUDGET_BYTES
  ) {
    throw new Error("Contract-size evidence uses an unsupported policy.");
  }
  assertReleaseCompilerConfiguration({
    solc: report.compiler?.solcVersion,
    optimizer: report.compiler?.optimizerEnabled,
    optimizer_runs: report.compiler?.optimizerRuns,
    via_ir: report.compiler?.viaIR,
  });
  if (!/^[0-9a-f]{40}$/i.test(report.sourceCommit)) {
    throw new Error("Contract-size evidence source commit is malformed.");
  }
  if (!/^[0-9a-f]{64}$/i.test(report.compilerConfigSha256)) {
    throw new Error("Contract-size compiler configuration hash is malformed.");
  }
  const expectedContracts = new Map<string, ContractSizeTier>(
    DEPLOYABLE_CONTRACTS.map((contract) => [contract.name, contract.tier]),
  );
  if (report.contracts?.length !== expectedContracts.size) {
    throw new Error("Contract-size evidence has an incomplete contract set.");
  }
  for (const contract of report.contracts) {
    const tier = expectedContracts.get(contract.contractName);
    if (!tier || tier !== contract.tier) {
      throw new Error(
        `Contract-size evidence contains unexpected contract ${contract.contractName}.`,
      );
    }
    const evaluated = evaluateContractSize(contract);
    if (
      !/^0x[0-9a-f]{64}$/i.test(contract.runtimeCodeHash) ||
      !evaluated.passed ||
      contract.passed !== true ||
      contract.maximumBytes !== evaluated.maximumBytes ||
      contract.eip170MarginBytes !== evaluated.eip170MarginBytes ||
      contract.policyMarginBytes !== evaluated.policyMarginBytes
    ) {
      throw new Error(
        `Contract-size evidence failed for ${contract.contractName}.`,
      );
    }
    expectedContracts.delete(contract.contractName);
  }
  if (expectedContracts.size || report.passed !== true) {
    throw new Error("Contract-size evidence did not pass.");
  }
  if (expected?.sourceCommit && report.sourceCommit !== expected.sourceCommit) {
    throw new Error("Contract-size evidence source commit is stale.");
  }
  if (
    expected?.compilerConfigSha256 &&
    report.compilerConfigSha256 !== expected.compilerConfigSha256
  ) {
    throw new Error("Contract-size compiler configuration has changed.");
  }
  return report;
}
