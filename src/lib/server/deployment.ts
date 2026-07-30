import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Address } from "viem";

export type ServerDeployment = {
  schemaVersion: number;
  environment: string;
  chainId: number;
  deploymentBlock: number;
  sourceCommit: string;
  mockOnly: boolean;
  contracts: {
    manager: Address;
    paymentRouter: Address;
    paymentToken: Address;
    marketVerifier: Address;
  };
  rpc: { primary: string; fallback?: string };
  verifier: { type: "mock" | "testnet-attested" | "chainlink" };
};

export async function loadServerDeployment(): Promise<ServerDeployment> {
  const chainId =
    process.env.NEXT_PUBLIC_GAME_MODE === "mainnet" ? 4663 : 46630;
  const file =
    process.env.KEYGAME_DEPLOYMENT_MANIFEST ??
    path.join(process.cwd(), "deployments", `${chainId}.json`);
  const manifest = JSON.parse(await readFile(file, "utf8")) as ServerDeployment;
  if (chainId === 46630 && process.env.ROBINHOOD_TESTNET_FALLBACK_RPC_URL) {
    manifest.rpc.fallback = process.env.ROBINHOOD_TESTNET_FALLBACK_RPC_URL;
  }
  if (chainId === 4663 && process.env.ROBINHOOD_MAINNET_FALLBACK_RPC_URL) {
    manifest.rpc.fallback = process.env.ROBINHOOD_MAINNET_FALLBACK_RPC_URL;
  }
  if (
    manifest.chainId !== chainId ||
    !manifest.contracts?.manager ||
    !manifest.contracts?.paymentRouter ||
    !manifest.contracts?.paymentToken
  ) {
    throw new Error("The active deployment manifest is incomplete.");
  }
  return manifest;
}
