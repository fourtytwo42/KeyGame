import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  formatEther,
  getAddress,
  http,
  parseEther,
} from "viem";

const DEPLOYMENT_GAS_ENVELOPE = 25_000_000n;
const GAS_MARGIN_BPS = 2_500n;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const rpcUrl =
  process.env.ROBINHOOD_MAINNET_RPC_URL ?? "http://192.168.50.173:8547";
const deployer = getAddress(required("DEPLOYER_ADDRESS"));
const client = createPublicClient({ transport: http(rpcUrl) });
if ((await client.getChainId()) !== 4663) {
  throw new Error("Budget RPC is not Robinhood mainnet chain 4663.");
}
const [gasPriceWei, deployerEth, head] = await Promise.all([
  client.getGasPrice(),
  client.getBalance({ address: deployer }),
  client.getBlockNumber(),
]);
const reserveWei = parseEther(
  process.env.KEYGAME_MAINNET_ETH_RESERVE ?? "0.005",
);
const executionWithMarginWei =
  (DEPLOYMENT_GAS_ENVELOPE * gasPriceWei * (10_000n + GAS_MARGIN_BPS) +
    9_999n) /
  10_000n;
const requiredDeployerWei = executionWithMarginWei + reserveWei;
const evidence = {
  checkedAt: new Date().toISOString(),
  chainId: 4663,
  head: head.toString(),
  rpcUrl,
  deployer,
  gas: {
    deploymentGas: DEPLOYMENT_GAS_ENVELOPE.toString(),
    gasPriceWei: gasPriceWei.toString(),
    marginBps: GAS_MARGIN_BPS.toString(),
    executionWithMarginWei: executionWithMarginWei.toString(),
    reserveWei: reserveWei.toString(),
    requiredDeployerWei: requiredDeployerWei.toString(),
  },
  balances: {
    deployerEthWei: deployerEth.toString(),
    deployerEth: formatEther(deployerEth),
  },
  sufficient: {
    deployerEth: deployerEth >= requiredDeployerWei,
  },
  launchValidation: "READ_ONLY",
  gameplayBudgetUsdg: 0,
  broadcastAuthorized: false,
};
const output =
  process.env.KEYGAME_MAINNET_BUDGET_EVIDENCE ??
  path.join("artifacts", "mainnet-release", "preauthorization-budget.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
