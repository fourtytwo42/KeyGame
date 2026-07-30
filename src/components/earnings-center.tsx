"use client";

import { useCallback, useEffect, useState } from "react";
import deployment from "../../deployments/31337.json";
import { useAccount } from "wagmi";

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
};

export function EarningsCenter() {
  const { address } = useAccount();
  const player =
    address ?? (deployment as { sessionPlayer?: `0x${string}` }).sessionPlayer;
  const [rewards, setRewards] = useState<Rewards | null>(null);
  const [message, setMessage] = useState("Loading the reward tape…");

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
    setMessage("Chain-derived balances. Estimated USD is display-only.");
  }, [player]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : "Rewards unavailable.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const claim = async () => {
    setMessage("Claiming every lifetime token…");
    const response = await fetch("/api/devnet/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "claim-lifetime" }),
    });
    const payload = (await response.json()) as { ok: boolean; error?: string };
    if (!payload.ok) {
      setMessage(payload.error || "Claim failed.");
      return;
    }
    await refresh();
    setMessage("Lifetime basket claimed. Your points did not change.");
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
      <button
        type="button"
        className="primaryAction"
        onClick={() => void claim()}
        disabled={rewards.totals.claimableUsd <= 0}
      >
        CLAIM LIFETIME STOCK BASKET
      </button>
      <p className="actionFinePrint">{message}</p>
    </div>
  );
}
