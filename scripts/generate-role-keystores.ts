import { randomBytes } from "node:crypto";
import { mkdir, open, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Wallet } from "ethers";

const roles = ["deployer", "keeper", "attestor", "faucet"] as const;
const base = path.join(os.homedir(), ".config", "keygame");
const keystoreDirectory = path.join(base, "keystores");
const passwordDirectory = path.join(base, "passwords");
await mkdir(keystoreDirectory, { recursive: true, mode: 0o700 });
await mkdir(passwordDirectory, { recursive: true, mode: 0o700 });

const created: Record<string, string> = {};
for (const role of roles) {
  const keystorePath = path.join(keystoreDirectory, `${role}.json`);
  const passwordPath = path.join(passwordDirectory, `${role}.password`);
  const reservation = await open(keystorePath, "wx", 0o600).catch(() => null);
  if (!reservation) {
    throw new Error(
      `${role} already exists; refusing to overwrite encrypted role material.`,
    );
  }
  const password = randomBytes(32).toString("base64url");
  const wallet = Wallet.createRandom();
  try {
    await reservation.writeFile(await wallet.encrypt(password));
    await reservation.close();
    await writeFile(passwordPath, `${password}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    await reservation.close().catch(() => undefined);
    throw error;
  }
  created[role] = wallet.address;
}

process.stdout.write(`${JSON.stringify({ created }, null, 2)}\n`);
