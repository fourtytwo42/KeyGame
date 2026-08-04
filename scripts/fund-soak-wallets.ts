import { readFile } from "node:fs/promises";

const envPath = process.env.KEYGAME_SOAK_ENV;
if (!envPath) throw new Error("KEYGAME_SOAK_ENV is required.");
const env = Object.fromEntries(
  (await readFile(envPath, "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
const appUrl = process.env.SOAK_APP_URL || "http://127.0.0.1:3001";
for (const label of ["A", "B"]) {
  const address = env[`KEYGAME_SOAK_PLAYER_${label}_ADDRESS`];
  if (!/^0x[a-fA-F0-9]{40}$/.test(address ?? "")) {
    throw new Error(`Soak wallet ${label} address is missing.`);
  }
  const response = await fetch(`${appUrl}/api/uat/fund`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const body = (await response.json()) as {
    error?: string;
    nativeHash?: string;
    tokenHash?: string;
  };
  if (!response.ok) {
    throw new Error(body.error || `Funding wallet ${label} failed.`);
  }
  process.stdout.write(
    `${label} ${address} ETH ${body.nativeHash} USDG ${body.tokenHash}\n`,
  );
}
