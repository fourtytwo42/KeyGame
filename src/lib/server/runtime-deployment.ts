import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

type RuntimeDeployment = {
  chainId?: number;
  contractVersion?: string;
};

function manifestPath() {
  return (
    process.env.KEYGAME_DEPLOYMENT_MANIFEST ||
    path.join(
      process.cwd(),
      "deployments",
      `${process.env.KEYGAME_CHAIN_ID || "31337"}.json`,
    )
  );
}

export function getRuntimeDeployment(): RuntimeDeployment {
  try {
    return JSON.parse(
      readFileSync(manifestPath(), "utf8"),
    ) as RuntimeDeployment;
  } catch {
    return {};
  }
}

export function isDevnetRuntime() {
  const deployment = getRuntimeDeployment();
  return (
    Number(process.env.KEYGAME_CHAIN_ID || deployment.chainId) === 31337 ||
    process.env.NEXT_PUBLIC_GAME_MODE === "devnet"
  );
}

export function isV4DevnetRuntime() {
  const deployment = getRuntimeDeployment();
  return (
    isDevnetRuntime() &&
    (deployment.contractVersion === "last-bell-v4-stock-pot" ||
      process.env.NEXT_PUBLIC_CONTRACT_VERSION === "last-bell-v4-stock-pot")
  );
}
