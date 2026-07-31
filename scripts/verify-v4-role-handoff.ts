import { createPublicClient, getAddress, http, parseAbi } from "viem";
import { readFile } from "node:fs/promises";

const manifestPath = process.env.KEYGAME_DEPLOYMENT_MANIFEST;
if (!manifestPath) throw new Error("KEYGAME_DEPLOYMENT_MANIFEST is required.");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  chainId: number;
  rpc: { primary: string };
  contracts: { manager: `0x${string}`; swapAdapter: `0x${string}` };
};
if (manifest.chainId !== 4663)
  throw new Error("Role verification is mainnet-only.");
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return getAddress(value);
};
const deployer = required("DEPLOYER_ADDRESS");
const expected = {
  managerAdmin: deployer,
  marketAdmin: deployer,
  treasury: deployer,
  keeper: deployer,
};
const client = createPublicClient({ transport: http(manifest.rpc.primary) });
const managerAbi = parseAbi([
  "function admin() view returns (address)",
  "function pendingAdmin() view returns (address)",
  "function keeper() view returns (address)",
  "function treasury() view returns (address)",
  "function pendingTreasury() view returns (address)",
  "function swapAdapter() view returns (address)",
]);
const adapterAbi = parseAbi([
  "function admin() view returns (address)",
  "function pendingAdmin() view returns (address)",
  "function configurationGuard() view returns (address)",
]);
const [
  managerAdmin,
  pendingManagerAdmin,
  keeper,
  treasury,
  pendingTreasury,
  adapterAddress,
  marketAdmin,
  pendingMarketAdmin,
  configurationGuard,
] = await Promise.all([
  client.readContract({
    address: manifest.contracts.manager,
    abi: managerAbi,
    functionName: "admin",
  }),
  client.readContract({
    address: manifest.contracts.manager,
    abi: managerAbi,
    functionName: "pendingAdmin",
  }),
  client.readContract({
    address: manifest.contracts.manager,
    abi: managerAbi,
    functionName: "keeper",
  }),
  client.readContract({
    address: manifest.contracts.manager,
    abi: managerAbi,
    functionName: "treasury",
  }),
  client.readContract({
    address: manifest.contracts.manager,
    abi: managerAbi,
    functionName: "pendingTreasury",
  }),
  client.readContract({
    address: manifest.contracts.manager,
    abi: managerAbi,
    functionName: "swapAdapter",
  }),
  client.readContract({
    address: manifest.contracts.swapAdapter,
    abi: adapterAbi,
    functionName: "admin",
  }),
  client.readContract({
    address: manifest.contracts.swapAdapter,
    abi: adapterAbi,
    functionName: "pendingAdmin",
  }),
  client.readContract({
    address: manifest.contracts.swapAdapter,
    abi: adapterAbi,
    functionName: "configurationGuard",
  }),
]);
const zero = "0x0000000000000000000000000000000000000000";
const checks = {
  managerAdmin: getAddress(managerAdmin) === expected.managerAdmin,
  managerPendingCleared: getAddress(pendingManagerAdmin) === zero,
  marketAdmin: getAddress(marketAdmin) === expected.marketAdmin,
  marketPendingCleared: getAddress(pendingMarketAdmin) === zero,
  keeper: getAddress(keeper) === expected.keeper,
  treasury: getAddress(treasury) === expected.treasury,
  treasuryPendingCleared: getAddress(pendingTreasury) === zero,
  managerAdapter:
    getAddress(adapterAddress) === getAddress(manifest.contracts.swapAdapter),
  adapterGuard:
    getAddress(configurationGuard) === getAddress(manifest.contracts.manager),
};
if (Object.values(checks).some((value) => !value)) {
  throw new Error(
    `Role handoff verification failed: ${JSON.stringify(checks)}`,
  );
}
process.stdout.write(
  `${JSON.stringify({ verified: true, checks }, null, 2)}\n`,
);
