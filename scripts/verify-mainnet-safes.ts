import { keccak256, type Address } from "viem";
import { loadManifest, publicClientFor } from "../services/common";

const manifest = await loadManifest();
if (manifest.chainId !== 4663 || manifest.mockOnly) {
  throw new Error(
    "Safe release verification is restricted to Robinhood mainnet.",
  );
}

const names = [
  "MANAGER_ADMIN_SAFE",
  "MARKET_ADMIN_SAFE",
  "TREASURY_SAFE",
] as const;
const safes = names.map((name) => {
  const value = process.env[name];
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} is required.`);
  }
  return { name, address: value as Address };
});
const expectedOwners = (process.env.SAFE_OWNER_ADDRESSES || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)
  .sort();
if (
  expectedOwners.length !== 3 ||
  new Set(expectedOwners).size !== 3 ||
  expectedOwners.some((owner) => !/^0x[0-9a-f]{40}$/.test(owner))
) {
  throw new Error("SAFE_OWNER_ADDRESSES must contain three unique addresses.");
}
const auditedCodeHashes = new Set(
  (process.env.AUDITED_SAFE_PROXY_CODE_HASHES || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
if (!auditedCodeHashes.size) {
  throw new Error(
    "AUDITED_SAFE_PROXY_CODE_HASHES must be supplied by release review.",
  );
}

const safeAbi = [
  {
    type: "function",
    name: "getOwners",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    type: "function",
    name: "getThreshold",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
const client = publicClientFor(manifest);
const evidence = [];
for (const safe of safes) {
  const [code, owners, threshold] = await Promise.all([
    client.getCode({ address: safe.address }),
    client.readContract({
      address: safe.address,
      abi: safeAbi,
      functionName: "getOwners",
    }),
    client.readContract({
      address: safe.address,
      abi: safeAbi,
      functionName: "getThreshold",
    }),
  ]);
  if (!code || code === "0x") throw new Error(`${safe.name} has no bytecode.`);
  const codeHash = keccak256(code).toLowerCase();
  const actualOwners = owners.map((owner) => owner.toLowerCase()).sort();
  if (!auditedCodeHashes.has(codeHash)) {
    throw new Error(
      `${safe.name} does not match an audited Safe proxy code hash.`,
    );
  }
  if (
    threshold !== 2n ||
    JSON.stringify(actualOwners) !== JSON.stringify(expectedOwners)
  ) {
    throw new Error(
      `${safe.name} is not the required common-owner 2-of-3 Safe.`,
    );
  }
  evidence.push({
    role: safe.name,
    address: safe.address,
    threshold: Number(threshold),
    owners: actualOwners,
    runtimeCodeHash: codeHash,
  });
}
if (new Set(safes.map((safe) => safe.address.toLowerCase())).size !== 3) {
  throw new Error(
    "Manager, verifier, and treasury must use separate Safe addresses.",
  );
}
process.stdout.write(
  `${JSON.stringify({ verified: true, evidence }, null, 2)}\n`,
);
