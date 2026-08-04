"use client";

import { useCallback, useEffect, useState } from "react";
import deployment from "../../deployments/31337.json";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { publicEnvironment } from "@/lib/env";
import { configuredGameChain } from "@/lib/web3/use-wallet-game";
import { rewardRouterV4Abi } from "@/lib/web3/last-bell-abi";

type Rewards = {
  address: string;
  points: {
    activePoints: number;
    pendingPoints: number;
    totalEligiblePoints: number;
    shareBps: number;
  };
  tokens: Array<{
    ticker: string;
    tokenAddress: string;
    claimable: number;
    claimed: number;
    totalEarned: number;
    estimatedUsd: number;
  }>;
  totals: {
    claimableUsd: number;
    claimedUsd: number;
    totalEarnedUsd: number;
  };
  batchClaimPlan: {
    rewardRouter: `0x${string}`;
    lifetimeVault: `0x${string}`;
    tokens: `0x${string}`[];
    holderRounds: `0x${string}`[];
    winningRounds: `0x${string}`[];
    cancelledRounds: `0x${string}`[];
    hasMoreRoundClaims?: boolean;
  };
};

export function EarningsCenter() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: configuredGameChain.id });
  const walletClient = useWalletClient({ chainId: configuredGameChain.id });
  const player =
    address ??
    (publicEnvironment.mode === "devnet"
      ? (deployment as { sessionPlayer?: `0x${string}` }).sessionPlayer
      : undefined);
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [message, setMessage] = useState("Loading the reward tape…");
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [filter, setFilter] = useState("ALL");

  const refresh = useCallback(async () => {
    if (!player) return;
    const response = await fetch(`/api/players/${player}/rewards`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      ok: boolean;
      rewards?: Rewards;
      error?: string;
    };
    if (!payload.rewards)
      throw new Error(payload.error || "Rewards unavailable.");
    setRewards(payload.rewards);
    const historyResponse = await fetch(
      `/api/players/${player}/reward-history`,
      { cache: "no-store" },
    );
    if (historyResponse.ok) {
      const tape = (await historyResponse.json()) as {
        contributions?: Array<Record<string, unknown>>;
        claims?: Array<Record<string, unknown>>;
      };
      setHistory([...(tape.claims ?? []), ...(tape.contributions ?? [])]);
    }
    setMessage("Chain-derived balances. Estimated USD is display-only.");
  }, [player]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!player) {
        setRewards(null);
        setMessage("Connect a wallet to view its earnings and reward math.");
        return;
      }
      void refresh().catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : "Rewards unavailable.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [player, refresh]);

  const claim = async () => {
    if (!rewards || !player) return;
    setMessage("Claiming the available reward basket…");
    if (publicEnvironment.mode === "devnet" && !address) {
      const response = await fetch("/api/devnet/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "claim-lifetime" }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
      };
      if (!payload.ok) {
        setMessage(payload.error || "Claim failed.");
        return;
      }
    } else {
      if (!address || !publicClient || !walletClient.data) {
        setMessage("Connect the wallet that earned these rewards.");
        return;
      }
      const plan = rewards.batchClaimPlan;
      const hash = await walletClient.data.writeContract({
        account: address,
        chain: configuredGameChain,
        address: plan.rewardRouter,
        abi: rewardRouterV4Abi,
        functionName: "claimAll",
        args: [
          address,
          plan.holderRounds ?? [],
          plan.winningRounds ?? [],
          plan.cancelledRounds ?? [],
          plan.tokens,
        ],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("The reward transaction reverted.");
      }
    }
    await refresh();
    setMessage(
      rewards.batchClaimPlan.hasMoreRoundClaims
        ? "Batch claimed. More older round rewards are ready for another batch."
        : "Available basket claimed. Lifetime points did not change.",
    );
  };

  if (!rewards) return <p>{message}</p>;
  return (
    <div className="earningsCenter">
      <div className="earningsTotals">
        <article>
          <span>CLAIMABLE</span>
          <strong>${rewards.totals.claimableUsd.toFixed(2)}</strong>
        </article>
        <article>
          <span>TOTAL CLAIMED</span>
          <strong>${rewards.totals.claimedUsd.toFixed(2)}</strong>
        </article>
        <article>
          <span>TOTAL EARNED</span>
          <strong>${rewards.totals.totalEarnedUsd.toFixed(2)}</strong>
        </article>
      </div>
      <section className="pointsMath">
        <h2>Lifetime points</h2>
        <p>
          {rewards.points.activePoints.toLocaleString()} active +{" "}
          {rewards.points.pendingPoints.toLocaleString()} pending
        </p>
        <p>
          Your active points / eligible supply ={" "}
          {rewards.points.activePoints.toLocaleString()} /{" "}
          {rewards.points.totalEligiblePoints.toLocaleString()} ={" "}
          {(rewards.points.shareBps / 100).toFixed(2)}%
        </p>
      </section>
      <div className="rewardTokenGrid">
        {rewards.tokens.map((token) => (
          <article key={token.tokenAddress}>
            <strong>{token.ticker}</strong>
            <span>{token.claimable.toFixed(6)} claimable</span>
            <span>{token.claimed.toFixed(6)} claimed</span>
            <span>{token.totalEarned.toFixed(6)} total earned</span>
          </article>
        ))}
      </div>
      <section className="rewardLedger">
        <header>
          <div>
            <h2>How your earnings happened</h2>
            <p>
              Each indexed entry keeps its round, category, share math, and
              chain transaction.
            </p>
          </div>
          <div className="ledgerFilters">
            {["ALL", "LAST_BELL", "WINNING_STOCK", "LIFETIME", "REFUND"].map(
              (category) => (
                <button
                  type="button"
                  key={category}
                  data-selected={filter === category}
                  onClick={() => setFilter(category)}
                >
                  {category.replaceAll("_", " ")}
                </button>
              ),
            )}
          </div>
        </header>
        {history.length ? (
          <div>
            {history
              .filter((row) => filter === "ALL" || row.category === filter)
              .map((row, index) => (
                <article
                  key={`${String(row.transaction_hash ?? row.transactionHash ?? "entry")}-${index}`}
                >
                  <strong>
                    {String(row.category ?? "CONTRIBUTION").replaceAll(
                      "_",
                      " ",
                    )}
                  </strong>
                  <span>
                    ROUND {String(row.round_id ?? row.roundId ?? "—")}
                  </span>
                  <span>
                    {row.numerator
                      ? `${String(row.numerator)} / ${String(row.denominator ?? "—")}`
                      : `${String(row.points ?? 0)} PTS`}
                  </span>
                  <code>
                    {String(
                      row.transaction_hash ?? row.transactionHash ?? "PENDING",
                    )}
                  </code>
                </article>
              ))}
          </div>
        ) : (
          <p>No indexed reward entries yet.</p>
        )}
      </section>
      <button
        type="button"
        className="primaryAction"
        onClick={() =>
          void claim().catch((error: unknown) =>
            setMessage(
              error instanceof Error ? error.message : "Claim failed.",
            ),
          )
        }
        disabled={
          rewards.totals.claimableUsd <= 0 &&
          rewards.batchClaimPlan.holderRounds.length === 0 &&
          rewards.batchClaimPlan.winningRounds.length === 0 &&
          rewards.batchClaimPlan.cancelledRounds.length === 0
        }
      >
        CLAIM AVAILABLE STOCK BASKETS
      </button>
      <p className="actionFinePrint">{message}</p>
    </div>
  );
}
