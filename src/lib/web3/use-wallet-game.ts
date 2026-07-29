"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import deploymentJson from "../../../deployments/31337.json";
import { factions, sessionApproval } from "@/lib/game/constants";
import type {
  ClaimableBalances,
  FactionId,
  SessionBudget,
} from "@/lib/game/types";
import { publicEnvironment } from "@/lib/env";
import { localDevnet, robinhoodChainTestnet } from "./chains";
import { devDollarAbi, lastBellAbi } from "./last-bell-abi";

const deployment = deploymentJson as {
  lastBellRound: `0x${string}`;
  devDollar: `0x${string}`;
};

export const configuredRoundAddress =
  publicEnvironment.roundAddress || deployment.lastBellRound;
export const configuredPaymentToken =
  publicEnvironment.devDollarAddress || deployment.devDollar;
export const configuredGameChain =
  publicEnvironment.mode === "testnet" ? robinhoodChainTestnet : localDevnet;

type WalletAction =
  | "idle"
  | "funding"
  | "approving"
  | "entering"
  | "claiming"
  | "revoking"
  | "claiming-reward"
  | "claiming-refund";

export function useWalletGame() {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: configuredGameChain.id });
  const walletClient = useWalletClient({ chainId: configuredGameChain.id });
  const [session, setSession] = useState<SessionBudget | null>(null);
  const [claimable, setClaimable] = useState<ClaimableBalances>({
    holderUsd: 0,
    factionUsd: 0,
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
      faction,
      spent,
      allowance,
      deadline,
      holder,
      winner,
      holderPool,
      factionPool,
      control,
      holderClaimed,
      factionClaimed,
      refundClaimed,
    ] = await Promise.all([
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "currentPhase",
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "factionOf",
        args: [address],
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "paid",
        args: [address],
      }),
      publicClient.readContract({
        address: configuredPaymentToken,
        abi: devDollarAbi,
        functionName: "allowance",
        args: [address, configuredRoundAddress],
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "deadline",
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "holder",
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "winningFaction",
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "holderPool",
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "factionPool",
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "controlTime",
        args: [address],
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "holderRewardClaimed",
        args: [address],
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "factionRewardClaimed",
        args: [address],
      }),
      publicClient.readContract({
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName: "refundClaimed",
        args: [address],
      }),
    ] as const);
    const [factionAirtime0, factionAirtime1, factionAirtime2, factionAirtime3] =
      await Promise.all(
        ([0, 1, 2, 3] as const).map((factionIndex) =>
          publicClient.readContract({
            address: configuredRoundAddress,
            abi: lastBellAbi,
            functionName: "factionAirtime",
            args: [factionIndex],
          }),
        ),
      );
    const joined = Number(faction) < factions.length;
    const spentUsd = Number(spent) / 1e6;
    const allowanceUsd = Number(allowance) / 1e6;
    const expired = Number(phase) >= 4;
    setSession({
      player: address,
      faction: joined ? factions[Number(faction)].id : null,
      maximumUsd: allowanceUsd,
      spentUsd,
      remainingUsd: allowanceUsd,
      availableActions: Math.floor(allowanceUsd),
      allowanceUsd,
      expiresAt: Number(deadline) || null,
      status: !joined
        ? "unjoined"
        : expired
          ? "expired"
          : allowance === 0n
            ? "revoked"
            : "active",
      mode: "wallet",
    });
    const factionEligible =
      Number(phase) === 4 &&
      joined &&
      Number(winner) === Number(faction) &&
      control > 0n &&
      !factionClaimed;
    const factionAirtime =
      [factionAirtime0, factionAirtime1, factionAirtime2, factionAirtime3][
        Number(faction)
      ] ?? 0n;
    setClaimable({
      holderUsd:
        Number(phase) === 4 &&
        holder.toLowerCase() === address.toLowerCase() &&
        !holderClaimed
          ? Number(holderPool) / 1e6
          : 0,
      factionUsd:
        factionEligible && factionAirtime > 0n
          ? (Number(factionPool) / 1e6) *
            (Number(control) / Number(factionAirtime))
          : 0,
      refundUsd: Number(phase) === 5 && !refundClaimed ? spentUsd : 0,
    });
  }, [address, publicClient]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(
      () => void refresh().catch(() => setSession(null)),
      0,
    );
    const timer = address
      ? window.setInterval(() => void refresh().catch(() => undefined), 2000)
      : undefined;
    return () => {
      window.clearTimeout(initialRefresh);
      if (timer) window.clearInterval(timer);
    };
  }, [address, refresh]);

  const write = useCallback(
    async (
      functionName:
        | "joinFaction"
        | "claimBell"
        | "claimHolderReward"
        | "claimFactionReward"
        | "claimCancellationRefund",
      args?: readonly [number],
    ) => {
      if (!address || !publicClient || !walletClient.data) {
        throw new Error("Connect the wallet on the game network first.");
      }
      const hash = await walletClient.data.writeContract({
        account: address,
        chain: configuredGameChain,
        address: configuredRoundAddress,
        abi: lastBellAbi,
        functionName,
        args,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new Error("Transaction reverted.");
      await refresh();
      return hash;
    },
    [address, publicClient, refresh, walletClient.data],
  );

  const ensureAllowance = useCallback(async () => {
    if (!address || !publicClient || !walletClient.data) {
      throw new Error("Connect the wallet on the game network first.");
    }
    const allowance = await publicClient.readContract({
      address: configuredPaymentToken,
      abi: devDollarAbi,
      functionName: "allowance",
      args: [address, configuredRoundAddress],
    });
    if (allowance >= BigInt(sessionApproval.refreshBelowUsd * 1e6)) return;

    setAction("approving");
    const approvalHash = await walletClient.data.writeContract({
      account: address,
      chain: configuredGameChain,
      address: configuredPaymentToken,
      abi: devDollarAbi,
      functionName: "approve",
      args: [configuredRoundAddress, BigInt(sessionApproval.amountUsd * 1e6)],
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: approvalHash,
    });
    if (receipt.status !== "success") {
      throw new Error("USDG approval was rejected.");
    }
  }, [address, publicClient, walletClient.data]);

  const enter = useCallback(
    async (faction: FactionId) => {
      if (!address || !publicClient || !walletClient.data || !ready) {
        throw new Error(
          `Connect and switch to ${configuredGameChain.name} before entering.`,
        );
      }
      setError(null);
      try {
        if (publicEnvironment.mode === "devnet") {
          setAction("funding");
          const response = await fetch("/api/devnet/faucet", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address }),
          });
          if (!response.ok) throw new Error("The local faucet failed.");
        }
        await ensureAllowance();
        setAction("entering");
        await write("joinFaction", [
          factions.findIndex((item) => item.id === faction),
        ]);
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Entry was rejected.";
        setError(message);
        throw cause;
      } finally {
        setAction("idle");
      }
    },
    [address, ensureAllowance, publicClient, ready, walletClient.data, write],
  );

  const claim = useCallback(async () => {
    setError(null);
    try {
      await ensureAllowance();
      setAction("claiming");
      return await write("claimBell");
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Claim rejected. The $1 game fee was not charged.";
      setError(`${message} The $1 game fee was not charged.`);
      throw cause;
    } finally {
      setAction("idle");
    }
  }, [ensureAllowance, write]);

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
        args: [configuredRoundAddress, 0n],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await refresh();
    } finally {
      setAction("idle");
    }
  }, [address, publicClient, refresh, walletClient.data]);

  const claimReward = useCallback(
    async (kind: "holder" | "faction" | "refund") => {
      setAction(kind === "refund" ? "claiming-refund" : "claiming-reward");
      try {
        return await write(
          kind === "holder"
            ? "claimHolderReward"
            : kind === "faction"
              ? "claimFactionReward"
              : "claimCancellationRefund",
        );
      } finally {
        setAction("idle");
      }
    },
    [write],
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
