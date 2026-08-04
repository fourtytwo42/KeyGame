import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createPublicClient, http, parseAbi, type Address } from "viem";
import { robinhoodChainTestnet } from "../src/lib/web3/chains";

type Broadcast = {
  transactions: Array<{
    contractName?: string;
    contractAddress?: Address;
    transactionType?: string;
  }>;
  receipts: Array<{ blockNumber?: string }>;
};

const projectRoot = process.cwd();
const broadcastPath = path.join(
  projectRoot,
  "broadcast",
  "DeployTestnet.s.sol",
  "46630",
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
    throw new Error(`${contractName} was not found in the broadcast.`);
  }
  return transaction.contractAddress;
};
const manager = addressOf("RoundManager");
const rpc =
  process.env.ROBINHOOD_TESTNET_RPC_URL ?? "http://192.168.50.117:8547";
const client = createPublicClient({
  chain: robinhoodChainTestnet,
  transport: http(rpc),
});
const paymentRouter = await client.readContract({
  address: manager,
  abi: parseAbi(["function paymentRouter() view returns (address)"]),
  functionName: "paymentRouter",
});
const deploymentBlock = Math.min(
  ...broadcast.receipts
    .map((receipt) =>
      receipt.blockNumber ? Number(BigInt(receipt.blockNumber)) : Infinity,
    )
    .filter(Number.isFinite),
);
const manifest = {
  schemaVersion: 2,
  environment: "robinhood-testnet",
  chainId: 46630,
  deploymentBlock,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  mockOnly: true,
  contractVersion: "closing-print-v3-airtime",
  contracts: {
    manager,
    paymentRouter,
    paymentToken: addressOf("TestnetMockUSDG"),
    marketVerifier: addressOf("TestnetAttestedMarketDataVerifier"),
  },
  rpc: { primary: "http://192.168.50.117:8547" },
  verifier: {
    type: "testnet-dex-attested",
    sourceChainId: 4663,
    twapWindowSeconds: 600,
  },
  assetCatalog: "config/testnet-stock-token-mocks.json",
};
await writeFile(
  path.join(projectRoot, "deployments", "46630.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
