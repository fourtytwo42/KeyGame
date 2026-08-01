import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Address } from "viem";
import { deploymentKeyFor } from "@/lib/deployment-key";

export type ServerDeployment = {
  schemaVersion: number;
  environment: string;
  chainId: number;
  deploymentBlock: number;
  sourceCommit: string;
  mockOnly: boolean;
  contractVersion?:
    | "last-bell-v4-stock-pot"
    | "closing-print-v3-airtime"
    | "closing-print-v2-dex";
  contracts: {
    manager: Address;
    paymentRouter: Address;
    paymentToken: Address;
    marketVerifier?: Address;
    lifetimePointsVault?: Address;
    rewardRouter?: Address;
    swapAdapter?: Address;
    activeRound?: Address;
  };
  rpc: {
    primary: string;
    fallback?: string;
    policy?: "LAN_ONLY";
    referenceUse?: "HEALTH_CHECK_ONLY";
    automaticFailover?: false;
  };
  verifier?: {
    type:
      | "mock"
      | "testnet-dex-attested"
      | "dex-onchain"
      | "mock-stock-swap-adapter"
      | "direct-v3-stock-swap";
  };
  roles?: {
    roleCustodyMode?: "single-deployer-eoa" | "safe-separated";
    managerAdmin?: Address;
    pendingManagerAdmin?: Address | null;
    marketAdmin?: Address;
    pendingMarketAdmin?: Address | null;
    treasury?: Address;
    pendingTreasury?: Address | null;
    conversionOperator?: Address;
    faucet?: Address;
    managerAdminSafe?: Address;
    marketAdminSafe?: Address;
    verifierAdminSafe?: Address;
    treasurySafe?: Address;
    commonOwners?: Address[];
    keeper?: Address;
  };
  releaseGates?: Record<string, boolean | string> & {
    externalWalletUatPassed?: boolean;
    externalWalletUatStatus?:
      "PASSED" | "SKIPPED_BY_OPERATOR" | "NOT_PERFORMED";
    browserWalletCompatibility?: "VERIFIED" | "UNVERIFIED";
    walletUatRequiredForCanary?: boolean;
    testnetTwoRoundSmokePassed?: boolean;
    testnetHistoricalSmokePassed?: boolean;
    testnetCurrentBytecodeMatches?: boolean;
    devnetLaunchRehearsalPassed?: boolean;
    mainnetBroadcastAuthorized?: boolean;
    mainnetDeploymentCompleted?: boolean;
    mainnetAuthorizationState?: "NOT_AUTHORIZED" | "CONSUMED";
    launchValidationStatus?: "NOT_DEPLOYED" | "PENDING" | "PASSED";
    promotionStatus?: "LOCKED" | "AUTHORIZED";
  };
  releaseEvidence?: {
    label?: string;
    internalSecurityReviewSha256?: string | null;
    operatorRiskAcceptanceSha256?: string | null;
    operatorRiskAcknowledgement?: string | null;
    operatorRiskAcknowledgedAt?: string | null;
    protectedBuildSha256?: string | null;
    externalWalletUatEvidenceSha256?: string | null;
    externalWalletUatDispositionRecordedAt?: string | null;
  };
};

export async function loadServerDeployment(): Promise<ServerDeployment> {
  const chainId =
    process.env.NEXT_PUBLIC_GAME_MODE === "mainnet" ? 4663 : 46630;
  const file =
    process.env.KEYGAME_DEPLOYMENT_MANIFEST ??
    (chainId === 4663
      ? path.join(
          /* turbopackIgnore: true*/ process.cwd(),
          "deployments",
          "4663.json",
        )
      : path.join(
          /* turbopackIgnore: true*/ process.cwd(),
          "deployments",
          "46630.json",
        ));
  const manifest = JSON.parse(
    await readFile(/* turbopackIgnore: true*/ file, "utf8"),
  ) as ServerDeployment;
  if (chainId === 46630 && process.env.ROBINHOOD_TESTNET_FALLBACK_RPC_URL) {
    manifest.rpc.fallback = process.env.ROBINHOOD_TESTNET_FALLBACK_RPC_URL;
  }
  if (chainId === 4663 && process.env.ROBINHOOD_MAINNET_FALLBACK_RPC_URL) {
    manifest.rpc.fallback = process.env.ROBINHOOD_MAINNET_FALLBACK_RPC_URL;
  }
  if (
    manifest.chainId !== chainId ||
    !manifest.contracts?.manager ||
    !manifest.contracts?.paymentRouter ||
    !manifest.contracts?.paymentToken ||
    (manifest.contractVersion === "last-bell-v4-stock-pot" &&
      (!manifest.contracts.swapAdapter ||
        !manifest.contracts.lifetimePointsVault ||
        !manifest.contracts.rewardRouter))
  ) {
    throw new Error("The active deployment manifest is incomplete.");
  }
  return manifest;
}

export async function loadServerDeploymentWithKey() {
  const manifest = await loadServerDeployment();
  return {
    manifest,
    deploymentKey: deploymentKeyFor(manifest),
    manifestHash: createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex"),
  };
}
