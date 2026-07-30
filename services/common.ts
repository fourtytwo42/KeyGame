import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  type Address,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Wallet } from "ethers";
import {
  localDevnet,
  robinhoodChainMainnet,
  robinhoodChainTestnet,
} from "../src/lib/web3/chains";
import { deploymentKeyFor } from "../src/lib/deployment-key";

export type DeploymentManifest = {
  schemaVersion: number;
  environment: "anvil" | "robinhood-testnet" | "robinhood-mainnet";
  chainId: number;
  deploymentBlock: number;
  sourceCommit: string;
  mockOnly: boolean;
  contractVersion?: "closing-print-v3-airtime" | "closing-print-v2-dex";
  contracts: {
    manager: Address;
    paymentRouter: Address;
    paymentToken: Address;
    marketVerifier: Address;
  };
  rpc: { primary: string; fallback?: string };
  verifier: {
    type: "mock" | "testnet-dex-attested" | "dex-onchain";
    proxy?: Address;
  };
};

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql:///keygame?host=/var/run/postgresql",
});

export async function loadManifest(): Promise<DeploymentManifest> {
  const explicit = process.env.KEYGAME_DEPLOYMENT_MANIFEST;
  const chainId = Number(process.env.KEYGAME_CHAIN_ID || 46630);
  const file =
    explicit ?? path.join(process.cwd(), "deployments", `${chainId}.json`);
  const manifest = JSON.parse(
    await readFile(file, "utf8"),
  ) as DeploymentManifest;
  const fallback =
    chainId === 4663
      ? process.env.ROBINHOOD_MAINNET_FALLBACK_RPC_URL
      : process.env.ROBINHOOD_TESTNET_FALLBACK_RPC_URL;
  if (fallback) manifest.rpc.fallback = fallback;
  return manifest;
}

export { deploymentKeyFor };

export function chainFor(chainId: number): Chain {
  if (chainId === 31337) return localDevnet;
  if (chainId === 46630) return robinhoodChainTestnet;
  if (chainId === 4663) return robinhoodChainMainnet;
  throw new Error(`Unsupported chain ${chainId}`);
}

export function publicClientFor(manifest: DeploymentManifest) {
  const transports = [http(manifest.rpc.primary, { timeout: 3_000 })];
  if (manifest.rpc.fallback) {
    transports.push(http(manifest.rpc.fallback, { timeout: 4_000 }));
  }
  return createPublicClient({
    chain: chainFor(manifest.chainId),
    transport: fallback(transports),
  });
}

export async function walletClientFor(
  manifest: DeploymentManifest,
  role: "keeper" | "deployer" | "attestor" | "faucet",
) {
  const prefix = `KEYGAME_${role.toUpperCase()}`;
  const keystorePath = process.env[`${prefix}_KEYSTORE`];
  const passwordPath = process.env[`${prefix}_PASSWORD_FILE`];
  if (!keystorePath || !passwordPath) {
    throw new Error(`${role} encrypted keystore is not configured`);
  }
  const [keystore, password] = await Promise.all([
    readFile(keystorePath, "utf8"),
    readFile(passwordPath, "utf8"),
  ]);
  const decrypted = await Wallet.fromEncryptedJson(keystore, password.trim());
  const account = privateKeyToAccount(decrypted.privateKey as `0x${string}`);
  return createWalletClient({
    account,
    chain: chainFor(manifest.chainId),
    transport: fallback([
      http(manifest.rpc.primary, { timeout: 3_000 }),
      ...(manifest.rpc.fallback
        ? [http(manifest.rpc.fallback, { timeout: 4_000 })]
        : []),
    ]),
  });
}

export async function encryptedWalletFor(
  role: "keeper" | "deployer" | "attestor" | "faucet",
) {
  const prefix = `KEYGAME_${role.toUpperCase()}`;
  const keystorePath = process.env[`${prefix}_KEYSTORE`];
  const passwordPath = process.env[`${prefix}_PASSWORD_FILE`];
  if (!keystorePath || !passwordPath) {
    throw new Error(`${role} encrypted keystore is not configured`);
  }
  const [keystore, password] = await Promise.all([
    readFile(keystorePath, "utf8"),
    readFile(passwordPath, "utf8"),
  ]);
  return Wallet.fromEncryptedJson(keystore, password.trim());
}

export async function heartbeat(
  service: string,
  chainId: number,
  status: string,
  details: Record<string, unknown> = {},
  client: Pool | PoolClient = pool,
) {
  await client.query(
    `INSERT INTO service_heartbeats(service, chain_id, status, details, observed_at)
     VALUES ($1,$2,$3,$4,now())
     ON CONFLICT(service,chain_id) DO UPDATE SET
       status=excluded.status, details=excluded.details, observed_at=excluded.observed_at`,
    [service, chainId, status, JSON.stringify(details)],
  );
}
