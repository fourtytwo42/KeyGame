import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  formatEther,
  getAddress,
  http,
  parseEther,
} from "viem";
import { validatePlannedMainnetDeployment } from "../src/lib/release/mainnet-deployment-plan";

const GAS_MARGIN_BPS = 2_500n;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const rpcUrl =
  process.env.ROBINHOOD_MAINNET_RPC_URL ?? "http://192.168.50.173:8547";
const deployer = getAddress(required("DEPLOYER_ADDRESS"));
const plannedManifestPath = path.resolve(
  required("KEYGAME_MAINNET_PLANNED_MANIFEST"),
);
const plannedManifestBytes = await readFile(plannedManifestPath);
const plannedManifest = validatePlannedMainnetDeployment(
  JSON.parse(plannedManifestBytes.toString("utf8")),
  { deployerAddress: deployer },
);
const deploymentGas = BigInt(plannedManifest.simulatedDeploymentGas);
const client = createPublicClient({ transport: http(rpcUrl) });
if ((await client.getChainId()) !== 4663) {
  throw new Error("Budget RPC is not Robinhood mainnet chain 4663.");
}
const [gasPriceWei, deployerEth, head, currentNonce] = await Promise.all([
  client.getGasPrice(),
  client.getBalance({ address: deployer }),
  client.getBlockNumber(),
  client.getTransactionCount({ address: deployer, blockTag: "pending" }),
]);
if (BigInt(currentNonce) !== BigInt(plannedManifest.deploymentNonce)) {
  throw new Error("The deployer nonce changed after planned simulation.");
}
const reserveWei = parseEther(
  process.env.KEYGAME_MAINNET_ETH_RESERVE ?? "0.005",
);
const executionWithMarginWei =
  (deploymentGas * gasPriceWei * (10_000n + GAS_MARGIN_BPS) + 9_999n) / 10_000n;
const requiredDeployerWei = executionWithMarginWei + reserveWei;
const evidence = {
  checkedAt: new Date().toISOString(),
  chainId: 4663,
  head: head.toString(),
  rpcUrl,
  deployer,
  deploymentNonce: currentNonce,
  plannedManifestSha256: createHash("sha256")
    .update(plannedManifestBytes)
    .digest("hex"),
  gas: {
    deploymentGas: deploymentGas.toString(),
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
