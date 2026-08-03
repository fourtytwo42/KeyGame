import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  getAddress,
  hexToString,
  http,
  keccak256,
  parseAbi,
  type Address,
} from "viem";
import {
  buildProvenanceFromSizeReport,
  deriveMainnetPlannedAddresses,
  validatePlannedMainnetDeployment,
  type MainnetPlannedAddresses,
  type PlannedMainnetDeploymentManifest,
} from "../src/lib/release/mainnet-deployment-plan";
import { validateContractSizeReport } from "../src/lib/release/contract-size";
import { robinhoodChainMainnet } from "../src/lib/web3/chains";
import { lastBellV4Abi } from "../src/lib/web3/last-bell-abi";

type Broadcast = {
  transactions: Array<{
    contractName?: string;
    contractAddress?: Address;
    transactionType?: string;
  }>;
  receipts: Array<{ transactionHash?: string; gasUsed?: string }>;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

const simulationRpc = required("KEYGAME_MAINNET_SIMULATION_RPC_URL");
const output = path.resolve(required("KEYGAME_MAINNET_PLANNED_MANIFEST"));
const deployerAddress = getAddress(required("DEPLOYER_ADDRESS"));
const deploymentNonce = BigInt(required("KEYGAME_MAINNET_DEPLOYMENT_NONCE"));
const forkBlockNumber = required("KEYGAME_MAINNET_FORK_BLOCK_NUMBER");
const forkBlockHash = required(
  "KEYGAME_MAINNET_FORK_BLOCK_HASH",
) as `0x${string}`;
const initialRoundId = required("INITIAL_ROUND_ID");
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const contractSizeEvidencePath = path.resolve(
  required("KEYGAME_CONTRACT_SIZE_EVIDENCE"),
);
const contractSizeEvidenceBytes = await readFile(contractSizeEvidencePath);
const contractSizeReport = validateContractSizeReport(
  JSON.parse(contractSizeEvidenceBytes.toString("utf8")),
  { sourceCommit },
);
const buildProvenance = buildProvenanceFromSizeReport(
  contractSizeReport,
  sha256(contractSizeEvidenceBytes),
);
const broadcastPath = path.resolve(
  process.env.KEYGAME_MAINNET_SIMULATION_BROADCAST ??
    path.join("broadcast", "DeployMainnet.s.sol", "4663", "run-latest.json"),
);
const broadcast = JSON.parse(
  await readFile(broadcastPath, "utf8"),
) as Broadcast;
const created = (name: string) => {
  const transaction = broadcast.transactions.find(
    (candidate) =>
      candidate.contractName === name && candidate.transactionType === "CREATE",
  );
  if (!transaction?.contractAddress) {
    throw new Error(`${name} was not found in the simulation broadcast.`);
  }
  return getAddress(transaction.contractAddress);
};
const client = createPublicClient({
  chain: robinhoodChainMainnet,
  transport: http(simulationRpc, { timeout: 8_000 }),
});
if ((await client.getChainId()) !== 4663) {
  throw new Error("The simulation RPC must use chain ID 4663.");
}
const swapAdapter = created("RobinhoodStockSwapAdapter");
const manager = created("RoundManagerV4");
const rewardRouter = created("RewardRouterV4");
const managerAbi = parseAbi([
  "function paymentRouter() view returns (address)",
  "function lifetimeVault() view returns (address)",
  "function activeRound() view returns (address)",
]);
const [paymentRouter, lifetimePointsVault, activeRound] = await Promise.all([
  client.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "paymentRouter",
  }),
  client.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "lifetimeVault",
  }),
  client.readContract({
    address: manager,
    abi: managerAbi,
    functionName: "activeRound",
  }),
]);
const addresses: MainnetPlannedAddresses = {
  swapAdapter,
  manager,
  paymentRouter: getAddress(paymentRouter),
  lifetimePointsVault: getAddress(lifetimePointsVault),
  rewardRouter,
  activeRound: getAddress(activeRound),
};
const approvedCatalogSize = 5;
const derived = deriveMainnetPlannedAddresses(
  deployerAddress,
  deploymentNonce,
  approvedCatalogSize,
);
for (const [name, address] of Object.entries(addresses)) {
  if (
    getAddress(address) !==
    getAddress(derived.addresses[name as keyof MainnetPlannedAddresses])
  ) {
    throw new Error(
      `${name} simulation address does not match nonce prediction.`,
    );
  }
}
if (broadcast.receipts.length !== derived.expectedTransactionCount) {
  throw new Error(
    `Simulation produced ${broadcast.receipts.length} transactions; expected ${derived.expectedTransactionCount}.`,
  );
}
const simulatedDeploymentGas = broadcast.receipts.reduce((total, receipt) => {
  if (!receipt.gasUsed)
    throw new Error("Simulation receipt is missing gasUsed.");
  return total + BigInt(receipt.gasUsed);
}, 0n);
const simulatedRuntimeCode = Object.fromEntries(
  await Promise.all(
    Object.entries(addresses).map(async ([name, address]) => {
      const code = await client.getCode({ address });
      if (!code || code === "0x") {
        throw new Error(`${name} has no simulated runtime bytecode.`);
      }
      return [name, { hash: keccak256(code), size: (code.length - 2) / 2 }];
    }),
  ),
) as Record<
  keyof MainnetPlannedAddresses,
  { hash: `0x${string}`; size: number }
>;
const expectedRuntimeCodeHashes = Object.fromEntries(
  Object.entries(simulatedRuntimeCode).map(([name, code]) => [name, code.hash]),
) as PlannedMainnetDeploymentManifest["expectedRuntimeCodeHashes"];
const expectedRuntimeCodeSizes = Object.fromEntries(
  Object.entries(simulatedRuntimeCode).map(([name, code]) => [name, code.size]),
) as PlannedMainnetDeploymentManifest["expectedRuntimeCodeSizes"];

const template = JSON.parse(
  await readFile("deployments/4663.template.json", "utf8"),
) as {
  market: {
    factory: Address;
    quoteToken: Address;
    approvedCatalog: Array<{
      symbol: string;
      stockToken: Address;
      pool: Address;
      feeTier: number;
    }>;
  };
};
const catalog = new Map(
  template.market.approvedCatalog.map((market) => [
    getAddress(market.stockToken),
    market,
  ]),
);
const initialRoster = await Promise.all(
  [0n, 1n, 2n, 3n].map(async (index) => {
    const config = await client.readContract({
      address: activeRound,
      abi: lastBellV4Abi,
      functionName: "tickerConfigs",
      args: [index],
    });
    const token = getAddress(config[2]);
    const catalogMarket = catalog.get(token);
    if (!catalogMarket)
      throw new Error(`Initial token ${token} is not catalogued.`);
    const symbol = hexToString(config[0], { size: 32 }).replace(/\0+$/g, "");
    if (symbol !== catalogMarket.symbol) {
      throw new Error(
        `Initial symbol ${symbol} does not match its catalog market.`,
      );
    }
    return {
      symbol,
      stockToken: token,
      pool: getAddress(catalogMarket.pool),
      feeTier: catalogMarket.feeTier,
    };
  }),
);

const plan: PlannedMainnetDeploymentManifest = {
  planSchemaVersion: 2,
  deploymentSchemaVersion: 4,
  environment: "robinhood-mainnet",
  chainId: 4663,
  sourceCommit,
  generatedAt: new Date().toISOString(),
  rpcPolicy: "LAN_ONLY",
  referenceUse: "HEALTH_CHECK_ONLY",
  automaticFailover: false,
  forkBlockNumber,
  forkBlockHash,
  deployerAddress,
  deploymentNonce: deploymentNonce.toString(),
  approvedCatalogSize,
  expectedTransactionCount: derived.expectedTransactionCount,
  simulatedDeploymentGas: simulatedDeploymentGas.toString(),
  expectedAddresses: addresses,
  expectedRuntimeCodeHashes,
  expectedRuntimeCodeSizes,
  buildProvenance,
  constructorConfiguration: {
    factory: getAddress(template.market.factory),
    usdg: getAddress(template.market.quoteToken),
    managerAdmin: deployerAddress,
    marketAdmin: deployerAddress,
    keeper: deployerAddress,
    treasury: deployerAddress,
    conversionOperator: deployerAddress,
    initialRoundId,
    startDurationSeconds: 300,
    extensionSeconds: 2,
    rugZoneSeconds: 10,
    hardCapSeconds: 600,
    heatTargetRawUsdg: "4000000000",
  },
  initialRoster,
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
validatePlannedMainnetDeployment(plan, {
  sourceCommit,
  deployerAddress,
  deploymentNonce,
});
const json = `${JSON.stringify(plan, null, 2)}\n`;
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, json, { encoding: "utf8", flag: "wx" });
await writeFile(
  `${output}.sha256`,
  `${sha256(json)}  ${path.basename(output)}\n`,
  { encoding: "utf8", flag: "wx" },
);
process.stdout.write(json);
