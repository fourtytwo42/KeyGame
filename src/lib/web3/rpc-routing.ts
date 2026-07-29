export type RobinhoodNetwork = "testnet" | "mainnet";

type RpcEndpointSet = {
  primary: string;
  fallback: string;
};

const defaults: Record<RobinhoodNetwork, RpcEndpointSet> = {
  testnet: {
    primary: "http://192.168.50.117:8547",
    fallback: "https://rpc.testnet.chain.robinhood.com",
  },
  mainnet: {
    primary: "http://192.168.50.173:8547",
    fallback: "https://rpc.mainnet.chain.robinhood.com",
  },
};

const url = (name: string, value: string) => {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`LAST BELL RPC CONFIGURATION ERROR: ${name} is invalid.`);
  }
};

export function readRpcEndpoints(
  network: RobinhoodNetwork,
  source: Partial<NodeJS.ProcessEnv> = process.env,
): RpcEndpointSet {
  const prefix =
    network === "mainnet" ? "ROBINHOOD_MAINNET" : "ROBINHOOD_TESTNET";
  return {
    primary: url(
      `${prefix}_RPC_URL`,
      source[`${prefix}_RPC_URL`] || defaults[network].primary,
    ),
    fallback: url(
      `${prefix}_FALLBACK_RPC_URL`,
      source[`${prefix}_FALLBACK_RPC_URL`] || defaults[network].fallback,
    ),
  };
}

export function isRobinhoodNetwork(value: string): value is RobinhoodNetwork {
  return value === "testnet" || value === "mainnet";
}
