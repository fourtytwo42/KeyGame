"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import deploymentJson from "../../../deployments/31337.json";
import { sessionApproval } from "@/lib/game/constants";
import type {
  ClaimableBalances,
  SessionBudget,
  TickerId,
} from "@/lib/game/types";
import { publicEnvironment } from "@/lib/env";
import {
  localDevnet,
  robinhoodChainMainnet,
  robinhoodChainTestnet,
} from "./chains";
import { devDollarAbi, lastBellAbi } from "./last-bell-abi";

const deployment = deploymentJson as unknown as {
  lastBellRound: `0x${string}`;
  devDollar: `0x${string}`;
  paymentRouter: `0x${string}`;
};

export const configuredRoundAddress =
  publicEnvironment.roundAddress || deployment.lastBellRound;
export const configuredPaymentToken =
  publicEnvironment.devDollarAddress || deployment.devDollar;
export const configuredPaymentRouter =
  publicEnvironment.paymentRouterAddress || deployment.paymentRouter;
export const configuredGameChain =
  publicEnvironment.mode === "mainnet"
    ? robinhoodChainMainnet
    : publicEnvironment.mode === "testnet"
      ? robinhoodChainTestnet
      : localDevnet;

type WalletAction =
  | "idle"
  | "funding"
  | "approving"
  | "claiming"
  | "revoking"
  | "claiming-reward"
  | "claiming-refund";

type ReportResponse = {
  ok: boolean;
  report: `0x${string}`;
  tickerIndex: number;
  error?: string;
};

export function useWalletGame(
  activeRoundAddress: `0x${string}` = configuredRoundAddress,
) {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: configuredGameChain.id });
  const walletClient = useWalletClient({ chainId: configuredGameChain.id });
  const [session, setSession] = useState<SessionBudget | null>(null);
  const [claimable, setClaimable] = useState<ClaimableBalances>({
    holderUsd: 0,
    closingPrintUsd: 0,
    refundUsd: 0,
  });
  const [action, setAction] = useState<WalletAction>("idle");
  const [error, setError] = useState<string | null>(null);

  const ready =
    Boolean(address) &&
    isConnected &&
    chainId === configuredGameChain.id &&
    Boolean(publicClient) &&
    Boolean(walletClient.data);

  const refresh = useCallback(async () => {
    if (!address || !publicClient) {
      setSession(null);
      return;
    }
    const [
      phase,
      spent,
      allowance,
      deadline,
      holder,
      winner,
      holderPool,
      closingPrintPool,
      holderClaimed,
      printClaimed,
      refundClaimed,
    ] = await Promise.all([
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "currentPhase",
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "paid",
        args: [address],
      }),
      publicClient.readContract({
        address: configuredPaymentToken,
        abi: devDollarAbi,
        functionName: "allowance",
        args: [address, configuredPaymentRouter],
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "deadline",
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "holder",
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "winningTicker",
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "holderPool",
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "closingPrintPool",
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "holderRewardClaimed",
        args: [address],
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "closingPrintRewardClaimed",
        args: [address],
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "refundClaimed",
        args: [address],
      }),
    ] as const);
    const winnerIndex = Number(winner) < 4 ? Number(winner) : 0;
    const [playerScore, tickerScore, configs] = await Promise.all([
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "playerTickerScore",
        args: [address, winnerIndex],
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "tickerScore",
        args: [winnerIndex],
      }),
      Promise.all(
        [0n, 1n, 2n, 3n].map((index) =>
          publicClient.readContract({
            address: activeRoundAddress,
            abi: lastBellAbi,
            functionName: "tickerConfigs",
            args: [index],
          }),
        ),
      ),
    ]);
    const balances = await Promise.all(
      configs.map((config) =>
        publicClient.readContract({
          address: config[1],
          abi: devDollarAbi,
          functionName: "balanceOf",
          args: [address],
        }),
      ),
    );
    const spentUsd = Number(spent) / 1e6;
    const allowanceUsd = Number(allowance) / 1e6;
    const expired = Number(phase) >= 4;
    setSession({
      player: address,
      starterTicker: null,
      maximumUsd: allowanceUsd,
      spentUsd,
      remainingUsd: allowanceUsd,
      availableActions: Math.floor(allowanceUsd),
      allowanceUsd,
      expiresAt: Number(deadline) || null,
      status:
        spent === 0n
          ? "new"
          : expired
            ? "expired"
            : allowance === 0n
              ? "revoked"
              : "active",
      mode: "wallet",
      producerPass: balances.some((balance) => balance > 0n),
    });
    setClaimable({
      holderUsd:
        Number(phase) === 4 &&
        holder.toLowerCase() === address.toLowerCase() &&
        !holderClaimed
          ? Number(holderPool) / 1e6
          : 0,
      closingPrintUsd:
        Number(phase) === 4 &&
        playerScore > 0n &&
        tickerScore > 0n &&
        !printClaimed
          ? (Number(closingPrintPool) / 1e6) *
            (Number(playerScore) / Number(tickerScore))
          : 0,
      refundUsd: Number(phase) === 5 && !refundClaimed ? spentUsd : 0,
    });
  }, [activeRoundAddress, address, publicClient]);

  useEffect(() => {
    const initial = window.setTimeout(
      () => void refresh().catch(() => setSession(null)),
      0,
    );
    const timer = address
      ? window.setInterval(() => void refresh().catch(() => undefined), 2000)
      : undefined;
    return () => {
      window.clearTimeout(initial);
      if (timer) window.clearInterval(timer);
    };
  }, [address, refresh]);

  const ensureAllowance = useCallback(async () => {
    if (!address || !publicClient || !walletClient.data) {
      throw new Error("Connect the wallet on the game network first.");
    }
    const allowance = await publicClient.readContract({
      address: configuredPaymentToken,
      abi: devDollarAbi,
      functionName: "allowance",
      args: [address, configuredPaymentRouter],
    });
    if (allowance >= BigInt(sessionApproval.refreshBelowUsd * 1e6)) return;
    setAction("approving");
    const hash = await walletClient.data.writeContract({
      account: address,
      chain: configuredGameChain,
      address: configuredPaymentToken,
      abi: devDollarAbi,
      functionName: "approve",
      args: [configuredPaymentRouter, BigInt(sessionApproval.amountUsd * 1e6)],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error("USDG approval was rejected.");
    }
  }, [address, publicClient, walletClient.data]);

  const claim = useCallback(
    async (ticker: TickerId) => {
      if (!address || !publicClient || !walletClient.data || !ready) {
        throw new Error(
          `Connect and switch to ${configuredGameChain.name} before playing.`,
        );
      }
      setError(null);
      try {
        await ensureAllowance();
        setAction("claiming");
        const response = await fetch(
          `/api/market/report?ticker=${encodeURIComponent(ticker)}`,
          { cache: "no-store" },
        );
        const market = (await response.json()) as ReportResponse;
        if (!response.ok || !market.ok) {
          throw new Error(market.error || "Verified market data unavailable.");
        }
        const hash = await walletClient.data.writeContract({
          account: address,
          chain: configuredGameChain,
          address: activeRoundAddress,
          abi: lastBellAbi,
          functionName: "claimBell",
          args: [market.tickerIndex, market.report, market.tickerIndex],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Claim reverted.");
        await refresh();
        return hash;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Claim rejected.";
        setError(`${message} The $1 game fee was not charged.`);
        throw cause;
      } finally {
        setAction("idle");
      }
    },
    [
      activeRoundAddress,
      address,
      ensureAllowance,
      publicClient,
      ready,
      refresh,
      walletClient.data,
    ],
  );

  const enter = useCallback(
    async (ticker: TickerId) => {
      if (publicEnvironment.mode === "devnet" && address) {
        setAction("funding");
        const response = await fetch("/api/devnet/faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        if (!response.ok) throw new Error("The local faucet failed.");
      }
      return claim(ticker);
    },
    [address, claim],
  );

  const revoke = useCallback(async () => {
    if (!address || !publicClient || !walletClient.data) return;
    setAction("revoking");
    try {
      const hash = await walletClient.data.writeContract({
        account: address,
        chain: configuredGameChain,
        address: configuredPaymentToken,
        abi: devDollarAbi,
        functionName: "approve",
        args: [configuredPaymentRouter, 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } finally {
      setAction("idle");
    }
  }, [address, publicClient, refresh, walletClient.data]);

  const claimReward = useCallback(
    async (kind: "holder" | "print" | "refund") => {
      if (!address || !publicClient || !walletClient.data) {
        throw new Error("Connect the wallet first.");
      }
      setAction(kind === "refund" ? "claiming-refund" : "claiming-reward");
      try {
        const functionName =
          kind === "holder"
            ? "claimHolderReward"
            : kind === "print"
              ? "claimClosingPrintReward"
              : "claimCancellationRefund";
        const hash = await walletClient.data.writeContract({
          account: address,
          chain: configuredGameChain,
          address: activeRoundAddress,
          abi: lastBellAbi,
          functionName,
        });
        await publicClient.waitForTransactionReceipt({ hash });
        await refresh();
        return hash;
      } finally {
        setAction("idle");
      }
    },
    [activeRoundAddress, address, publicClient, refresh, walletClient.data],
  );

  return useMemo(
    () => ({
      address,
      chainId,
      isConnected,
      ready,
      session,
      claimable,
      action,
      error,
      refresh,
      enter,
      claim,
      revoke,
      claimReward,
    }),
    [
      action,
      address,
      chainId,
      claim,
      claimReward,
      claimable,
      enter,
      error,
      isConnected,
      ready,
      refresh,
      revoke,
      session,
    ],
  );
}
