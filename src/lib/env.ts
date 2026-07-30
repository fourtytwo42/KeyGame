import type { Address } from "viem";

type GameMode = "simulator" | "devnet" | "testnet" | "mainnet";

const literalError = (name: string, reason: string): never => {
  throw new Error(`LAST BELL CONFIGURATION ERROR: ${name} ${reason}`);
};

const optionalUrl = (name: string, value?: string) => {
  if (!value) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    return literalError(name, "must be an absolute URL.");
  }
};

const optionalAddress = (name: string, value?: string): Address | undefined => {
  if (!value) return undefined;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return literalError(name, "must be a 20-byte EVM address.");
  }
  return value as Address;
};

export function readPublicEnvironment(
  source: Partial<NodeJS.ProcessEnv> = process.env,
) {
  const mode = (source.NEXT_PUBLIC_GAME_MODE || "simulator") as GameMode;
  if (!["simulator", "devnet", "testnet", "mainnet"].includes(mode)) {
    literalError(
      "NEXT_PUBLIC_GAME_MODE",
      "must be simulator, devnet, testnet, or mainnet.",
    );
  }

  const appUrl =
    optionalUrl("NEXT_PUBLIC_APP_URL", source.NEXT_PUBLIC_APP_URL) ||
    "http://localhost:3000/";
  const roundAddress = optionalAddress(
    "NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS",
    source.NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS,
  );
  const devDollarAddress = optionalAddress(
    "NEXT_PUBLIC_DEV_DOLLAR_ADDRESS",
    source.NEXT_PUBLIC_DEV_DOLLAR_ADDRESS,
  );
  const paymentRouterAddress = optionalAddress(
    "NEXT_PUBLIC_PAYMENT_ROUTER_ADDRESS",
    source.NEXT_PUBLIC_PAYMENT_ROUTER_ADDRESS,
  );
  const roundManagerAddress = optionalAddress(
    "NEXT_PUBLIC_ROUND_MANAGER_ADDRESS",
    source.NEXT_PUBLIC_ROUND_MANAGER_ADDRESS,
  );

  if (mode === "testnet" || mode === "mainnet") {
    if (!roundAddress && !roundManagerAddress) {
      literalError(
        "NEXT_PUBLIC_ROUND_MANAGER_ADDRESS",
        `or NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS is required in ${mode} mode.`,
      );
    }
    if (!devDollarAddress) {
      literalError(
        "NEXT_PUBLIC_DEV_DOLLAR_ADDRESS",
        `is required in ${mode} mode.`,
      );
    }
    if (!paymentRouterAddress) {
      literalError(
        "NEXT_PUBLIC_PAYMENT_ROUTER_ADDRESS",
        `is required in ${mode} mode.`,
      );
    }
  }

  return {
    mode,
    appUrl,
    localRpcUrl:
      optionalUrl(
        "NEXT_PUBLIC_LOCAL_RPC_URL",
        source.NEXT_PUBLIC_LOCAL_RPC_URL,
      ) || "http://127.0.0.1:8545/",
    robinhoodTestnetRpcUrl:
      optionalUrl(
        "NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL",
        source.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL,
      ) || new URL("/api/rpc/testnet", appUrl).toString(),
    robinhoodMainnetRpcUrl:
      optionalUrl(
        "NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL",
        source.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL,
      ) || new URL("/api/rpc/mainnet", appUrl).toString(),
    roundAddress,
    devDollarAddress,
    paymentRouterAddress,
    roundManagerAddress,
    walletConnectProjectId:
      source.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || undefined,
  };
}

export const publicEnvironment = readPublicEnvironment();
