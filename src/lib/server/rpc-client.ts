import "server-only";
import { createPublicClient, fallback, http } from "viem";
import {
  robinhoodChainMainnet,
  robinhoodChainTestnet,
} from "@/lib/web3/chains";
import type { ServerDeployment } from "./deployment";

export function deploymentPublicClient(manifest: ServerDeployment) {
  return createPublicClient({
    chain:
      manifest.chainId === 4663 ? robinhoodChainMainnet : robinhoodChainTestnet,
    transport: fallback([
      http(manifest.rpc.primary, { timeout: 3_000 }),
      ...(manifest.rpc.fallback
        ? [http(manifest.rpc.fallback, { timeout: 4_000 })]
        : []),
    ]),
  });
}
