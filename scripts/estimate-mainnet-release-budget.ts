import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  formatEther,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseEther,
} from "viem";
import {
  calculateMainnetGasBudget,
  MAINNET_CANARY_BUDGET_RAW,
  plannedCanarySpendByActorRaw,
  plannedCanarySpendRaw,
} from "../src/lib/release/mainnet-canary";

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
]);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const rpcUrl =
  process.env.ROBINHOOD_MAINNET_RPC_URL ?? "http://192.168.50.173:8547";
const deployer = getAddress(required("DEPLOYER_ADDRESS"));
const player = getAddress(required("KEYGAME_CANARY_ADDRESS"));
if (deployer === player) throw new Error("Canary player must be non-admin.");
const usdg = getAddress("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168");
const client = createPublicClient({ transport: http(rpcUrl) });
if ((await client.getChainId()) !== 4663) {
  throw new Error("Budget RPC is not Robinhood mainnet chain 4663.");
}
const [gasPriceWei, deployerEth, playerEth, deployerUsdg, playerUsdg, head] =
  await Promise.all([
    client.getGasPrice(),
    client.getBalance({ address: deployer }),
    client.getBalance({ address: player }),
    client.readContract({
      address: usdg,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [deployer],
    }),
    client.readContract({
      address: usdg,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [player],
    }),
    client.getBlockNumber(),
  ]);
const reserveWei = parseEther(
  process.env.KEYGAME_MAINNET_ETH_RESERVE ?? "0.005",
);
const playerReserveWei = parseEther(
  process.env.KEYGAME_MAINNET_PLAYER_ETH_RESERVE ?? "0.001",
);
const gas = calculateMainnetGasBudget({
  gasPriceWei,
  reserveWei,
  playerReserveWei,
});
const spend = plannedCanarySpendByActorRaw();
const evidence = {
  checkedAt: new Date().toISOString(),
  chainId: 4663,
  head: head.toString(),
  rpcUrl,
  deployer,
  player,
  gas: Object.fromEntries(
    Object.entries(gas).map(([key, value]) => [key, value.toString()]),
  ),
  balances: {
    deployerEthWei: deployerEth.toString(),
    deployerEth: formatEther(deployerEth),
    playerEthWei: playerEth.toString(),
    playerEth: formatEther(playerEth),
    deployerUsdgRaw: deployerUsdg.toString(),
    deployerUsdg: formatUnits(deployerUsdg, 6),
    playerUsdgRaw: playerUsdg.toString(),
    playerUsdg: formatUnits(playerUsdg, 6),
  },
  scriptedSpend: {
    totalRaw: plannedCanarySpendRaw().toString(),
    ceilingRaw: MAINNET_CANARY_BUDGET_RAW.toString(),
    deployerRaw: spend.deployer.toString(),
    playerRaw: spend.player.toString(),
  },
  sufficient: {
    deployerEth: deployerEth >= gas.requiredDeployerWei,
    deployerUsdg: deployerUsdg >= spend.deployer,
    playerUsdg: playerUsdg >= spend.player,
    playerGas: playerEth >= gas.requiredPlayerWei,
  },
  broadcastAuthorized: false,
};
const output =
  process.env.KEYGAME_MAINNET_BUDGET_EVIDENCE ??
  path.join("artifacts", "mainnet-canary", "preauthorization-budget.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
