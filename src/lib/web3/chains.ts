import { defineChain } from "viem";
import { anvil } from "wagmi/chains";
import { publicEnvironment } from "@/lib/env";

export const localDevnet = defineChain({
  ...anvil,
  name: "Saved by the Bell Local Devnet",
  nativeCurrency: { name: "Dev Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [publicEnvironment.localRpcUrl] },
  },
});

export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [publicEnvironment.robinhoodTestnetRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Testnet Explorer",
      url: "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

export const robinhoodChainMainnet = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [publicEnvironment.robinhoodMainnetRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

export const supportedChains = [
  localDevnet,
  robinhoodChainTestnet,
  robinhoodChainMainnet,
] as const;
