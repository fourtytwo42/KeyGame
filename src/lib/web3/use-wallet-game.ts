"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { maxUint256 } from "viem";
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
import { devDollarAbi, lastBellAbi, lastBellV4Abi } from "./last-bell-abi";

const deployment = deploymentJson as unknown as {
  lastBellRound: `0x${string}`;
  devDollar: `0x${string}`;
  paymentRouter: `0x${string}`;
  swapAdapter?: `0x${string}`;
  stockTokens?: `0x${string}`[];
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
  contractVersion:
    | "saved-bell-v5-market-pot"
    | "last-bell-v4-stock-pot"
    | "closing-print-v3-airtime"
    | "closing-print-v2-dex"
    | "closing-print-v1"
    | "faction-v0" = "closing-print-v3-airtime",
) {
  const v4Economy =
    contractVersion === "saved-bell-v5-market-pot" ||
    contractVersion === "last-bell-v4-stock-pot";
  const legacyPayout = contractVersion !== "closing-print-v3-airtime";
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: configuredGameChain.id });
  const walletClient = useWalletClient({ chainId: configuredGameChain.id });
  const [session, setSession] = useState<SessionBudget | null>(null);
  const [claimable, setClaimable] = useState<ClaimableBalances>({
    holderUsd: 0,
    airtimeUsd: 0,
    refundUsd: 0,
  });
  const [action, setAction] = useState<WalletAction>("idle");
  const [error, setError] = useState<string | null>(null);
  const [latestApprovalHash, setLatestApprovalHash] = useState<
    `0x${string}` | null
  >(null);
  const [latestContributionHash, setLatestContributionHash] = useState<
    `0x${string}` | null
  >(null);

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
    if (v4Economy) {
      const [phase, spent, allowance, deadline] = await Promise.all([
        publicClient.readContract({
          address: activeRoundAddress,
          abi: lastBellV4Abi,
          functionName: "currentPhase",
        }),
        publicClient.readContract({
          address: activeRoundAddress,
          abi: lastBellV4Abi,
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
          abi: lastBellV4Abi,
          functionName: "deadline",
        }),
      ]);
      setSession({
        player: address,
        starterTicker: null,
        maximumUsd: 0,
        spentUsd: Number(spent) / 1e6,
        remainingUsd: 0,
        availableActions: 0,
        allowanceUsd:
          allowance === maxUint256
            ? Number.MAX_SAFE_INTEGER
            : Number(allowance) / 1e6,
        expiresAt: Number(deadline) || null,
        status:
          Number(phase) >= 4 ? "expired" : spent === 0n ? "new" : "active",
        mode: "wallet",
        producerPass: false,
      });
      setClaimable({ holderUsd: 0, airtimeUsd: 0, refundUsd: 0 });
      return;
    }
    const [
      phase,
      spent,
      allowance,
      deadline,
      holder,
      holderPool,
      airtimePool,
      holderClaimed,
      poolClaimed,
      refundClaimed,
      winner,
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
        functionName: "holderPool",
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: legacyPayout ? "closingPrintPool" : "airtimePool",
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
        functionName: legacyPayout
          ? "closingPrintRewardClaimed"
          : "airtimeRewardClaimed",
        args: [address],
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "refundClaimed",
        args: [address],
      }),
      publicClient.readContract({
        address: activeRoundAddress,
        abi: lastBellAbi,
        functionName: "winningTicker",
      }),
    ] as const);
    const configs = await Promise.all(
      [0n, 1n, 2n, 3n].map((index) =>
        publicClient.readContract({
          address: activeRoundAddress,
          abi: lastBellAbi,
          functionName: "tickerConfigs",
          args: [index],
        }),
      ),
    );
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
    const winnerIndex = Number(winner) < 4 ? Number(winner) : 0;
    const [playerControlTime, totalControlTime] = legacyPayout
      ? await Promise.all([
          publicClient.readContract({
            address: activeRoundAddress,
            abi: lastBellAbi,
            functionName: "playerTickerAirtime",
            args: [address, winnerIndex],
          }),
          publicClient.readContract({
            address: activeRoundAddress,
            abi: lastBellAbi,
            functionName: "tickerAirtime",
            args: [winnerIndex],
          }),
        ])
      : await Promise.all([
          publicClient.readContract({
            address: activeRoundAddress,
            abi: lastBellAbi,
            functionName: "controlTime",
            args: [address],
          }),
          publicClient.readContract({
            address: activeRoundAddress,
            abi: lastBellAbi,
            functionName: "totalControlTime",
          }),
        ]);
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
      airtimeUsd:
        Number(phase) === 4 &&
        playerControlTime > 0n &&
        totalControlTime > 0n &&
        !poolClaimed
          ? (Number(airtimePool) / 1e6) *
            (Number(playerControlTime) / Number(totalControlTime))
          : 0,
      refundUsd: Number(phase) === 5 && !refundClaimed ? spentUsd : 0,
    });
  }, [activeRoundAddress, address, legacyPayout, publicClient, v4Economy]);

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

  const ensureAllowance = useCallback(
    async (requiredAmount = 1n) => {
      if (!address || !publicClient || !walletClient.data) {
        throw new Error("Connect the wallet on the game network first.");
      }
      const allowance = await publicClient.readContract({
        address: configuredPaymentToken,
        abi: devDollarAbi,
        functionName: "allowance",
        args: [address, configuredPaymentRouter],
      });
      if (
        v4Economy
          ? allowance >= requiredAmount
          : allowance >= BigInt(sessionApproval.refreshBelowUsd * 1e6)
      )
        return;
      setAction("approving");
      const hash = await walletClient.data.writeContract({
        account: address,
        chain: configuredGameChain,
        address: configuredPaymentToken,
        abi: devDollarAbi,
        functionName: "approve",
        args: [
          configuredPaymentRouter,
          v4Economy ? maxUint256 : BigInt(sessionApproval.amountUsd * 1e6),
        ],
      });
      setLatestApprovalHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("USDG approval was rejected.");
      }
    },
    [address, publicClient, v4Economy, walletClient.data],
  );

  const claim = useCallback(
    async (ticker: TickerId, amountUsd = 1) => {
      if (!address || !publicClient || !walletClient.data || !ready) {
        throw new Error(
          `Connect and switch to ${configuredGameChain.name} before playing.`,
        );
      }
      setError(null);
      try {
        const amount = BigInt(Math.floor(amountUsd * 1e6));
        await ensureAllowance(amount);
        setAction("claiming");
        if (v4Economy) {
          const response = await fetch("/api/game/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ticker, amountUsd, slippageBps: 10_000 }),
          });
          const payload = (await response.json()) as {
            ok: boolean;
            quote?: {
              tickerIndex: number;
              minimumStockOut: string;
              expiresAt: number;
            };
            error?: string;
          };
          if (!response.ok || !payload.quote) {
            throw new Error(payload.error || "Stock quote unavailable.");
          }
          const hash = await walletClient.data.writeContract({
            account: address,
            chain: configuredGameChain,
            address: activeRoundAddress,
            abi: lastBellV4Abi,
            functionName: "claimBell",
            args: [
              payload.quote.tickerIndex,
              amount,
              BigInt(payload.quote.minimumStockOut),
              BigInt(payload.quote.expiresAt),
              255,
            ],
          });
          setLatestContributionHash(hash);
          const receipt = await publicClient.waitForTransactionReceipt({
            hash,
          });
          if (receipt.status !== "success")
            throw new Error("Contribution reverted.");
          await refresh();
          return hash;
        }
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
        setLatestContributionHash(hash);
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
      v4Economy,
    ],
  );

  const enter = useCallback(
    async (ticker: TickerId, amountUsd = 1) => {
      if (publicEnvironment.mode === "devnet" && address) {
        setAction("funding");
        const response = await fetch("/api/devnet/faucet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        if (!response.ok) throw new Error("The local faucet failed.");
      }
      return claim(ticker, amountUsd);
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
    async (kind: "holder" | "airtime" | "refund") => {
      if (!address || !publicClient || !walletClient.data) {
        throw new Error("Connect the wallet first.");
      }
      setAction(kind === "refund" ? "claiming-refund" : "claiming-reward");
      try {
        if (v4Economy) {
          const functionName =
            kind === "holder"
              ? "claimHolderRewardFor"
              : kind === "airtime"
                ? "claimWinningStockRewardFor"
                : "claimCancellationRefundFor";
          const hash = await walletClient.data.writeContract({
            account: address,
            chain: configuredGameChain,
            address: activeRoundAddress,
            abi: lastBellV4Abi,
            functionName,
            args: [address],
          });
          await publicClient.waitForTransactionReceipt({ hash });
          await refresh();
          return hash;
        }
        const functionName =
          kind === "holder"
            ? "claimHolderReward"
            : kind === "airtime"
              ? legacyPayout
                ? "claimClosingPrintReward"
                : "claimAirtimeReward"
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
    [
      activeRoundAddress,
      address,
      legacyPayout,
      publicClient,
      refresh,
      walletClient.data,
      v4Economy,
    ],
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
      latestApprovalHash,
      latestContributionHash,
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
      latestApprovalHash,
      latestContributionHash,
      isConnected,
      ready,
      refresh,
      revoke,
      session,
    ],
  );
}
