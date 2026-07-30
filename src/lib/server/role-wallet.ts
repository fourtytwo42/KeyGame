import "server-only";
import { readFile } from "node:fs/promises";
import { createWalletClient, fallback, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Wallet } from "ethers";
import type { ServerDeployment } from "./deployment";
import {
  robinhoodChainMainnet,
  robinhoodChainTestnet,
} from "@/lib/web3/chains";

export async function loadRoleWallet(
  role: "faucet" | "attestor" | "keeper" | "deployer",
  manifest: ServerDeployment,
) {
  const prefix = `KEYGAME_${role.toUpperCase()}`;
  const keystorePath = process.env[`${prefix}_KEYSTORE`];
  const passwordPath = process.env[`${prefix}_PASSWORD_FILE`];
  if (!keystorePath || !passwordPath) {
    throw new Error(`${role} encrypted keystore is not configured.`);
  }
  const [keystore, password] = await Promise.all([
    readFile(keystorePath, "utf8"),
    readFile(passwordPath, "utf8"),
  ]);
  const decrypted = await Wallet.fromEncryptedJson(keystore, password.trim());
  const account = privateKeyToAccount(decrypted.privateKey as `0x${string}`);
  return createWalletClient({
    account,
    chain:
      manifest.chainId === 4663 ? robinhoodChainMainnet : robinhoodChainTestnet,
    transport: fallback([
      http(manifest.rpc.primary, { timeout: 3_000 }),
      ...(manifest.rpc.fallback
        ? [http(manifest.rpc.fallback, { timeout: 4_000 })]
        : []),
    ]),
  });
}
