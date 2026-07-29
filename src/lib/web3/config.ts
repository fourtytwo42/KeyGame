import { createConfig, http } from "wagmi";
import {
  coinbaseWallet,
  injected,
  metaMask,
  safe,
  walletConnect,
} from "wagmi/connectors";
import { localDevnet, robinhoodChainTestnet } from "./chains";

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

const connectors = [
  injected({ shimDisconnect: true }),
  metaMask(),
  coinbaseWallet({ appName: "Last Bell" }),
  safe(),
];

if (walletConnectProjectId) {
  connectors.push(
    walletConnect({
      projectId: walletConnectProjectId,
      showQrModal: true,
      metadata: {
        name: "Last Bell",
        description: "The last caller holding the bell wins the broadcast.",
        url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        icons: [
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/brand/icon-192.png`,
        ],
      },
    }),
  );
}

export const walletConfig = createConfig({
  chains: [localDevnet, robinhoodChainTestnet],
  connectors,
  transports: {
    [localDevnet.id]: http(
      process.env.NEXT_PUBLIC_LOCAL_RPC_URL || "http://127.0.0.1:8545",
    ),
    [robinhoodChainTestnet.id]: http(
      process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL ||
        "https://rpc.testnet.chain.robinhood.com",
    ),
  },
  multiInjectedProviderDiscovery: true,
  ssr: true,
});

export const walletConnectConfigured = Boolean(walletConnectProjectId);
