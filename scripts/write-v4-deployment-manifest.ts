import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  hexToString,
  http,
  keccak256,
  parseAbi,
  type Address,
} from "viem";
import {
  robinhoodChainMainnet,
  robinhoodChainTestnet,
} from "../src/lib/web3/chains";
import {
  lastBellV4Abi,
  stockSwapAdapterAbi,
} from "../src/lib/web3/last-bell-abi";
import { validateContractSizeReport } from "../src/lib/release/contract-size";
import { buildProvenanceFromSizeReport } from "../src/lib/release/mainnet-deployment-plan";

type Broadcast = {
  transactions: Array<{
    contractName?: string;
    contractAddress?: Address;
    transactionType?: string;
    hash?: string;
  }>;
  receipts: Array<{ blockNumber?: string; transactionHash?: string }>;
};

const chainId = Number(process.env.KEYGAME_WRITE_MANIFEST_CHAIN_ID);
if (chainId !== 4663 && chainId !== 46630) {
  throw new Error("KEYGAME_WRITE_MANIFEST_CHAIN_ID must be 4663 or 46630.");
}
const mainnet = chainId === 4663;
const scriptName = mainnet ? "DeployMainnet.s.sol" : "DeployTestnetV4.s.sol";
const broadcastPath = path.join(
  process.cwd(),
  "broadcast",
  scriptName,
  String(chainId),
  "run-latest.json",
);
const broadcast = JSON.parse(
  await readFile(broadcastPath, "utf8"),
) as Broadcast;
const addressOf = (contractName: string) => {
  const transaction = broadcast.transactions.find(
    (candidate) =>
      candidate.contractName === contractName &&
      candidate.transactionType === "CREATE",
  );
  if (!transaction?.contractAddress) {
    throw new Error(`${contractName} was not found in ${broadcastPath}.`);
  }
  return transaction.contractAddress;
};
const manager = addressOf("RoundManagerV4");
const rewardRouter = addressOf("RewardRouterV4");
const swapAdapter = addressOf(
  mainnet ? "RobinhoodStockSwapAdapter" : "MockStockSwapAdapter",
);
const rpc = mainnet
  ? process.env.ROBINHOOD_MAINNET_RPC_URL
  : process.env.ROBINHOOD_TESTNET_RPC_URL;
if (!rpc) throw new Error("The target Robinhood RPC URL is required.");
const client = createPublicClient({
  chain: mainnet ? robinhoodChainMainnet : robinhoodChainTestnet,
  transport: http(rpc, { timeout: 8_000 }),
});
if ((await client.getChainId()) !== chainId) throw new Error("Wrong chain.");

const managerAbi = parseAbi([
  "function paymentRouter() view returns (address)",
  "function paymentToken() view returns (address)",
  "function lifetimeVault() view returns (address)",
  "function activeRound() view returns (address)",
  "function swapAdapter() view returns (address)",
  "function admin() view returns (address)",
  "function pendingAdmin() view returns (address)",
  "function pendingTreasury() view returns (address)",
  "function keeper() view returns (address)",
  "function treasury() view returns (address)",
]);
const [
  paymentRouter,
  paymentToken,
  lifetimePointsVault,
  activeRound,
  configuredAdapter,
  managerAdmin,
  pendingManagerAdmin,
  pendingTreasury,
  keeper,
  treasury,
] = (await Promise.all(
  [
    "paymentRouter",
    "paymentToken",
    "lifetimeVault",
    "activeRound",
    "swapAdapter",
    "admin",
    "pendingAdmin",
    "pendingTreasury",
    "keeper",
    "treasury",
  ].map((functionName) =>
    client.readContract({
      address: manager,
      abi: managerAbi,
      functionName: functionName as never,
    }),
  ),
)) as Address[];
if (configuredAdapter.toLowerCase() !== swapAdapter.toLowerCase()) {
  throw new Error("Manager swap adapter does not match the broadcast.");
}

const stockTokens = await Promise.all(
  [0n, 1n, 2n, 3n].map(async (index) => {
    const config = await client.readContract({
      address: activeRound,
      abi: lastBellV4Abi,
      functionName: "tickerConfigs",
      args: [index],
    });
    return {
      symbol: hexToString(config[0], { size: 32 }).replace(/\0+$/g, ""),
      assetId: config[1],
      token: config[2],
    };
  }),
);
const addresses = {
  manager,
  paymentRouter,
  paymentToken,
  lifetimePointsVault,
  rewardRouter,
  swapAdapter,
  activeRound,
};
const runtimeCode = Object.fromEntries(
  await Promise.all(
    Object.entries(addresses).map(async ([name, address]) => {
      const code = await client.getCode({ address });
      if (!code || code === "0x") throw new Error(`${name} has no bytecode.`);
      return [name, { hash: keccak256(code), size: (code.length - 2) / 2 }];
    }),
  ),
) as Record<string, { hash: `0x${string}`; size: number }>;
const runtimeCodeHashes = Object.fromEntries(
  Object.entries(runtimeCode).map(([name, code]) => [name, code.hash]),
);
const runtimeCodeSizes = Object.fromEntries(
  Object.entries(runtimeCode).map(([name, code]) => [name, code.size]),
);
const abiHashes = Object.fromEntries(
  [
    "LastBellRoundV4",
    "RoundManagerV4",
    "LifetimePointsVault",
    "RewardRouterV4",
    "PaymentRouter",
    mainnet ? "RobinhoodStockSwapAdapter" : "MockStockSwapAdapter",
  ].map((contract) => {
    const abi = execFileSync(
      path.join(process.env.HOME ?? "", ".foundry", "bin", "forge"),
      ["inspect", contract, "abi", "--json"],
      { encoding: "utf8" },
    );
    return [contract, createHash("sha256").update(abi).digest("hex")];
  }),
);
const deploymentBlock = Math.min(
  ...broadcast.receipts
    .map((receipt) =>
      receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : Infinity,
    )
    .filter(Number.isFinite),
);
if (!Number.isFinite(deploymentBlock)) {
  throw new Error("The broadcast has no deployment block.");
}
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const contractSizeEvidencePath = path.resolve(
  process.env.KEYGAME_CONTRACT_SIZE_EVIDENCE ??
    path.join("artifacts", "contract-size", "release-contract-sizes.json"),
);
const contractSizeEvidenceBytes = await readFile(contractSizeEvidencePath);
const contractSizeReport = validateContractSizeReport(
  JSON.parse(contractSizeEvidenceBytes.toString("utf8")),
  { sourceCommit },
);
const contractSizeReportSha256 = createHash("sha256")
  .update(contractSizeEvidenceBytes)
  .digest("hex");
const buildProvenance = buildProvenanceFromSizeReport(
  contractSizeReport,
  contractSizeReportSha256,
);
const approvedCatalog = mainnet
  ? await (async () => {
      const count = Number(
        await client.readContract({
          address: swapAdapter,
          abi: stockSwapAdapterAbi,
          functionName: "marketCount",
        }),
      );
      return Promise.all(
        Array.from({ length: count }, async (_, index) => {
          const stockToken = await client.readContract({
            address: swapAdapter,
            abi: stockSwapAdapterAbi,
            functionName: "catalog",
            args: [BigInt(index)],
          });
          const market = await client.readContract({
            address: swapAdapter,
            abi: stockSwapAdapterAbi,
            functionName: "markets",
            args: [stockToken],
          });
          return {
            symbol: hexToString(market[0], { size: 32 }).replace(/\0+$/g, ""),
            assetId: market[1],
            stockToken,
            pool: market[2],
            feeTier: market[3],
            minimumLiquidity: market[4].toString(),
            minimumUsdgDepth: market[5].toString(),
            enabled: market[6],
          };
        }),
      );
    })()
  : stockTokens.map((asset) => ({
      symbol: asset.symbol,
      stockToken: asset.token,
      mockOnly: true,
    }));

const manifest = {
  schemaVersion: 4,
  environment: mainnet ? "robinhood-mainnet" : "robinhood-testnet",
  chainId,
  deploymentBlock,
  sourceCommit,
  mockOnly: !mainnet,
  valueLabel: mainnet ? undefined : "TESTNET MOCK · NO VALUE",
  contractVersion: "last-bell-v4-stock-pot",
  broadcastLocked: mainnet,
  contracts: {
    ...addresses,
    seedRebalancer: "MANAGER_INTERNAL_V4",
    mockUsdg: mainnet ? undefined : paymentToken,
    mockStockTokens: mainnet
      ? undefined
      : stockTokens.map((asset) => asset.token),
  },
  roles: {
    roleCustodyMode: "single-deployer-eoa",
    managerAdmin,
    pendingManagerAdmin,
    marketAdmin: managerAdmin,
    treasury,
    pendingTreasury,
    keeper,
    conversionOperator: managerAdmin,
    faucet: mainnet ? undefined : managerAdmin,
  },
  rpc: {
    primary: mainnet
      ? "http://192.168.50.173:8547"
      : "http://192.168.50.117:8547",
    fallback: "SERVER_ONLY_CONFIGURED",
    policy: "LAN_ONLY",
    referenceUse: "HEALTH_CHECK_ONLY",
    automaticFailover: false,
  },
  market: {
    type: mainnet ? "direct-uniswap-v3-stock-swap" : "mock-stock-swap-adapter",
    catalogLimit: 16,
    approvedCatalog,
  },
  runtimeCodeHashes,
  runtimeCodeSizes,
  buildProvenance,
  abiHashes,
  broadcastTransactions: broadcast.receipts.map(
    (receipt) => receipt.transactionHash,
  ),
  sourceVerification: "pending-separate-verifier-step",
  releaseGates: {
    contractSizePassed: true,
    testnetSmokePassed: mainnet,
    internalSecurityReviewPassed:
      process.env.INTERNAL_SECURITY_REVIEW_PASSED === "true",
    operatorRiskAcknowledged: true,
    roleCustodyVerified: mainnet,
    externalWalletUatPassed: false,
    externalWalletUatStatus: mainnet ? "SKIPPED_BY_OPERATOR" : "NOT_PERFORMED",
    browserWalletCompatibility: "UNVERIFIED",
    walletUatRequiredForCanary: false,
    devnetLaunchRehearsalPassed: mainnet,
    testnetTwoRoundSmokePassed: mainnet,
    testnetHistoricalSmokePassed: mainnet,
    testnetCurrentBytecodeMatches: mainnet,
    mainnetGameplayPretested: false,
    launchValidation: mainnet ? "READ_ONLY" : "NOT_APPLICABLE",
    promotionRequiresSeparateAuthorization: mainnet,
    mainnetBroadcastAuthorized: false,
    mainnetDeploymentCompleted: mainnet,
    mainnetAuthorizationState: mainnet ? "CONSUMED" : "NOT_APPLICABLE",
    launchValidationStatus: mainnet ? "PENDING" : "NOT_APPLICABLE",
    promotionStatus: mainnet ? "LOCKED" : "NOT_APPLICABLE",
  },
  releaseEvidence: {
    label:
      "INTERNALLY REVIEWED · NO INDEPENDENT AUDIT · EXTERNAL WALLET COMPATIBILITY UNVERIFIED",
    internalSecurityReviewSha256:
      process.env.INTERNAL_SECURITY_REVIEW_SHA256 ?? null,
    operatorRiskAcknowledgement: "No legal review or independent audit",
    operatorRiskAcknowledgedAt: "2026-07-31",
    protectedBuildSha256: process.env.PROTECTED_BUILD_SHA256 ?? null,
    contractSizeReportSha256,
    externalWalletUatEvidenceSha256: null,
    externalWalletUatDispositionRecordedAt: "2026-07-31",
  },
};
const deploymentPath = path.join(
  process.cwd(),
  "deployments",
  `${chainId}.json`,
);
try {
  const existing = JSON.parse(await readFile(deploymentPath, "utf8")) as {
    contractVersion?: string;
  };
  if (existing.contractVersion === "last-bell-v4-stock-pot") {
    throw new Error(
      `Refusing to overwrite existing v4 manifest ${deploymentPath}.`,
    );
  }
  const archive = path.join(process.cwd(), "deployments", "archive");
  await mkdir(archive, { recursive: true });
  await rename(
    deploymentPath,
    path.join(archive, `${chainId}-pre-v4-${Date.now()}.json`),
  );
} catch (error) {
  if (
    error instanceof Error &&
    !("code" in error && (error as NodeJS.ErrnoException).code === "ENOENT")
  ) {
    throw error;
  }
}
await writeFile(deploymentPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
}).catch(async (error: NodeJS.ErrnoException) => {
  if (error.code !== "EEXIST") throw error;
  const existing = await stat(deploymentPath);
  throw new Error(
    `Manifest already exists (${existing.size} bytes); refusing overwrite.`,
  );
});
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
