import {
  createPublicClient,
  getAddress,
  http,
  parseAbi,
  zeroAddress,
} from "viem";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const manifestPath = process.env.KEYGAME_DEPLOYMENT_MANIFEST;
if (!manifestPath) throw new Error("KEYGAME_DEPLOYMENT_MANIFEST is required.");
const deployerValue = process.env.DEPLOYER_ADDRESS;
if (!deployerValue) throw new Error("DEPLOYER_ADDRESS is required.");
const deployer = getAddress(deployerValue);
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
  chainId: number;
  mockOnly: boolean;
  rpc: { primary: string };
  roles?: Record<string, string | null>;
  releaseGates?: Record<string, boolean>;
  contracts: { manager: `0x${string}`; swapAdapter: `0x${string}` };
};
if (![4663, 46630].includes(manifest.chainId)) {
  throw new Error(
    "Role-custody verification is restricted to Robinhood Chain.",
  );
}

const client = createPublicClient({ transport: http(manifest.rpc.primary) });
const managerAbi = parseAbi([
  "function admin() view returns (address)",
  "function pendingAdmin() view returns (address)",
  "function keeper() view returns (address)",
  "function treasury() view returns (address)",
  "function pendingTreasury() view returns (address)",
  "function swapAdapter() view returns (address)",
]);
const [admin, pendingAdmin, keeper, treasury, pendingTreasury, adapter] =
  await Promise.all([
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
  ]);

const checks: Record<string, boolean> = {
  roleCustodyMode: manifest.roles?.roleCustodyMode === "single-deployer-eoa",
  managerAdmin: getAddress(admin) === deployer,
  managerPendingCleared: getAddress(pendingAdmin) === zeroAddress,
  keeper: getAddress(keeper) === deployer,
  treasury: getAddress(treasury) === deployer,
  treasuryPendingCleared: getAddress(pendingTreasury) === zeroAddress,
  managerAdapter:
    getAddress(adapter) === getAddress(manifest.contracts.swapAdapter),
  manifestManagerAdmin:
    getAddress(manifest.roles?.managerAdmin ?? zeroAddress) === deployer,
  manifestMarketAdmin:
    getAddress(manifest.roles?.marketAdmin ?? zeroAddress) === deployer,
  manifestKeeper:
    getAddress(manifest.roles?.keeper ?? zeroAddress) === deployer,
  manifestTreasury:
    getAddress(manifest.roles?.treasury ?? zeroAddress) === deployer,
  manifestConversionOperator:
    getAddress(manifest.roles?.conversionOperator ?? zeroAddress) === deployer,
};

if (!manifest.mockOnly) {
  const adapterAbi = parseAbi([
    "function admin() view returns (address)",
    "function pendingAdmin() view returns (address)",
    "function configurationGuard() view returns (address)",
  ]);
  const [marketAdmin, pendingMarketAdmin, guard] = await Promise.all([
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
  checks.marketAdmin = getAddress(marketAdmin) === deployer;
  checks.marketPendingCleared = getAddress(pendingMarketAdmin) === zeroAddress;
  checks.adapterGuard =
    getAddress(guard) === getAddress(manifest.contracts.manager);
}

if (Object.values(checks).some((value) => !value)) {
  throw new Error(
    `Single-deployer role verification failed: ${JSON.stringify(checks)}`,
  );
}
manifest.releaseGates = { ...manifest.releaseGates, roleCustodyVerified: true };
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const evidence = {
  verified: true,
  chainId: manifest.chainId,
  deployer,
  custodyMode: "single-deployer-eoa",
  checks,
  verifiedAt: new Date().toISOString(),
};
const evidencePath = process.env.KEYGAME_ROLE_CUSTODY_EVIDENCE;
if (evidencePath) {
  await writeFile(
    path.resolve(evidencePath),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
}
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
