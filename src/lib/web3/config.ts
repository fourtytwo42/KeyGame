import { createConfig, http } from "wagmi";
import {
  coinbaseWallet,
  injected,
  metaMask,
  safe,
  walletConnect,
} from "wagmi/connectors";
import { publicEnvironment } from "@/lib/env";
import {
  localDevnet,
  robinhoodChainMainnet,
  robinhoodChainTestnet,
} from "./chains";

const walletConnectProjectId = publicEnvironment.walletConnectProjectId;

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
        url: publicEnvironment.appUrl,
        icons: [new URL("/brand/icon-192.png", publicEnvironment.appUrl).href],
      },
    }),
  );
}

export const walletConfig = createConfig({
  chains: [localDevnet, robinhoodChainTestnet, robinhoodChainMainnet],
  connectors,
  transports: {
    [localDevnet.id]: http(publicEnvironment.localRpcUrl),
    [robinhoodChainTestnet.id]: http(publicEnvironment.robinhoodTestnetRpcUrl),
    [robinhoodChainMainnet.id]: http(publicEnvironment.robinhoodMainnetRpcUrl),
  },
  multiInjectedProviderDiscovery: true,
  ssr: true,
});

export const walletConnectConfigured = Boolean(walletConnectProjectId);
