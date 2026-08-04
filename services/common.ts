import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  createPublicClient,
  createWalletClient,
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
  deployer?: Address;
  players?: Address[];
  contractVersion?:
    | "saved-bell-v5-market-pot"
    | "last-bell-v4-stock-pot"
    | "closing-print-v3-airtime"
    | "closing-print-v2-dex";
  contracts: {
    manager: Address;
    paymentRouter: Address;
    paymentToken: Address;
    marketVerifier: Address;
    lifetimePointsVault?: Address;
    roundFactory?: Address;
    rewardRouter?: Address;
    swapAdapter?: Address;
    activeRound?: Address;
  };
  rpc: {
    primary: string;
    fallback?: string;
    policy?: "LAN_ONLY";
    referenceUse?: "HEALTH_CHECK_ONLY";
    automaticFailover?: false;
  };
  verifier?: {
    type:
      | "mock"
      | "testnet-dex-attested"
      | "dex-onchain"
      | "mock-stock-swap-adapter"
      | "direct-v3-stock-swap";
    proxy?: Address;
  };
  roles?: {
    roleCustodyMode?: string;
    managerAdmin?: Address;
    pendingManagerAdmin?: Address | null;
    marketAdmin?: Address;
    pendingMarketAdmin?: Address | null;
    keeper?: Address;
    treasury?: Address;
    pendingTreasury?: Address | null;
    conversionOperator?: Address;
  };
  releaseGates?: Record<string, boolean | string>;
  releaseEvidence?: Record<string, string | null>;
};

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgresql:///keygame?host=/var/run/postgresql",
});

// PostgreSQL may restart during planned fault injection or host maintenance.
// Pool emits an error for an idle client before later queries reconnect; an
// explicit listener prevents that transient disconnect from terminating the
// keeper, indexer, or qualification controller.
pool.on("error", (error) => {
  process.stderr.write(
    `${new Date().toISOString()} PostgreSQL pool disconnect: ${error.message}\n`,
  );
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
  const forcedFailureMarker =
    process.env.SOAK_RPC_FAILURE_MARKER ??
    path.join(process.cwd(), ".soak", "rpc-primary-failure");
  const primary =
    manifest.chainId === 46630 && existsSync(forcedFailureMarker)
      ? "http://127.0.0.1:1"
      : manifest.rpc.primary;
  return createPublicClient({
    chain: chainFor(manifest.chainId),
    transport: http(primary, { timeout: 3_000 }),
  });
}

export async function walletClientFor(
  manifest: DeploymentManifest,
  role: "keeper" | "deployer" | "attestor" | "faucet" | "canary",
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
    transport: http(manifest.rpc.primary, { timeout: 3_000 }),
  });
}

export async function encryptedWalletFor(
  role: "keeper" | "deployer" | "attestor" | "faucet" | "canary",
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
