import { readFile } from "node:fs/promises";
import { validateFinalTestnetSmokeEvidence } from "../src/lib/release/testnet-v4";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

const result = validateFinalTestnetSmokeEvidence({
  expectedCommit: required("SOURCE_COMMIT"),
  manifest: await readJson(required("TESTNET_V4_DEPLOYMENT_MANIFEST")),
  bytecode: await readJson(required("TESTNET_V4_BYTECODE_EVIDENCE")),
  reconciliation: await readJson(required("TESTNET_V4_SMOKE_REPORT")),
});

process.stdout.write(`${JSON.stringify({ ok: true, ...result }, null, 2)}\n`);
