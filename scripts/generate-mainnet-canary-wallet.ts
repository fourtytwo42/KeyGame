import { randomBytes } from "node:crypto";
import { mkdir, open, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Wallet } from "ethers";

const base = path.join(os.homedir(), ".config", "keygame", "mainnet-canary");
const keystorePath = path.join(base, "canary-player.json");
const passwordPath = path.join(base, "canary-player.password");
await mkdir(base, { recursive: true, mode: 0o700 });
const reservation = await open(keystorePath, "wx", 0o600).catch(() => null);
if (!reservation) {
  throw new Error(
    "Mainnet canary wallet already exists; refusing to overwrite it.",
  );
}
const password = randomBytes(32).toString("base64url");
const wallet = Wallet.createRandom();
try {
  const encrypted = JSON.parse(await wallet.encrypt(password)) as Record<
    string,
    unknown
  >;
  if (encrypted.Crypto && !encrypted.crypto) {
    encrypted.crypto = encrypted.Crypto;
    delete encrypted.Crypto;
  }
  await reservation.writeFile(JSON.stringify(encrypted));
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
process.stdout.write(
  `${JSON.stringify({ address: wallet.address, keystorePath, passwordPath }, null, 2)}\n`,
);
