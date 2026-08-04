import { randomBytes } from "node:crypto";
import { chmod, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Wallet } from "ethers";

const root = path.join(os.homedir(), ".config", "keygame", "soak");
await Promise.all([
  mkdir(root, { recursive: true, mode: 0o700 }),
  mkdir(path.join(process.cwd(), ".soak"), { recursive: true, mode: 0o700 }),
]);
const envPath = path.join(root, "soak.env");
await stat(envPath)
  .then(() => {
    throw new Error(
      "Soak wallet configuration already exists; refusing overwrite.",
    );
  })
  .catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });

const lines: string[] = [];
const publicAddresses: Record<string, string> = {};
for (const label of ["A", "B"] as const) {
  const wallet = Wallet.createRandom();
  const password = randomBytes(32).toString("base64url");
  const keystorePath = path.join(root, `player-${label.toLowerCase()}.json`);
  const passwordPath = path.join(
    root,
    `player-${label.toLowerCase()}.password`,
  );
  await Promise.all([
    writeFile(keystorePath, await wallet.encrypt(password), { mode: 0o600 }),
    writeFile(passwordPath, `${password}\n`, { mode: 0o600 }),
  ]);
  lines.push(
    `KEYGAME_SOAK_PLAYER_${label}_KEYSTORE=${keystorePath}`,
    `KEYGAME_SOAK_PLAYER_${label}_PASSWORD_FILE=${passwordPath}`,
    `KEYGAME_SOAK_PLAYER_${label}_ADDRESS=${wallet.address}`,
  );
  publicAddresses[label] = wallet.address;
}
const controlTokenPath = path.join(root, "control.token");
await writeFile(controlTokenPath, `${randomBytes(32).toString("hex")}\n`, {
  mode: 0o600,
});
lines.push(
  `SOAK_CONTROL_TOKEN_FILE=${controlTokenPath}`,
  `SOAK_RPC_FAILURE_MARKER=${path.join(process.cwd(), ".soak", "rpc-primary-failure")}`,
);
await writeFile(envPath, `${lines.join("\n")}\n`, { mode: 0o600 });
await Promise.all([
  chmod(root, 0o700),
  chmod(envPath, 0o600),
  chmod(controlTokenPath, 0o600),
]);
process.stdout.write(`${JSON.stringify(publicAddresses)}\n`);
