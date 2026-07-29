import type { Address } from "viem";

type GameMode = "simulator" | "devnet" | "testnet";

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
  if (!["simulator", "devnet", "testnet"].includes(mode)) {
    literalError(
      "NEXT_PUBLIC_GAME_MODE",
      "must be simulator, devnet, or testnet.",
    );
  }

  return {
    mode,
    appUrl:
      optionalUrl("NEXT_PUBLIC_APP_URL", source.NEXT_PUBLIC_APP_URL) ||
      "http://localhost:3000/",
    localRpcUrl:
      optionalUrl(
        "NEXT_PUBLIC_LOCAL_RPC_URL",
        source.NEXT_PUBLIC_LOCAL_RPC_URL,
      ) || "http://127.0.0.1:8545/",
    robinhoodTestnetRpcUrl:
      optionalUrl(
        "NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL",
        source.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL,
      ) || "https://rpc.testnet.chain.robinhood.com/",
    roundAddress: optionalAddress(
      "NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS",
      source.NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS,
    ),
    devDollarAddress: optionalAddress(
      "NEXT_PUBLIC_DEV_DOLLAR_ADDRESS",
      source.NEXT_PUBLIC_DEV_DOLLAR_ADDRESS,
    ),
    walletConnectProjectId:
      source.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || undefined,
  };
}

export const publicEnvironment = readPublicEnvironment();
