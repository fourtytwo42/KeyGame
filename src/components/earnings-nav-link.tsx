"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

export function EarningsNavLink() {
  const { address, isConnected } = useAccount();
  const [claimable, setClaimable] = useState(0);
  useEffect(() => {
    if (!address || !isConnected) {
      return;
    }
    const controller = new AbortController();
    const refresh = () =>
      void fetch(`/api/players/${address}/rewards`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((payload: { rewards?: { totals?: { claimableUsd?: number } } }) =>
          setClaimable(payload.rewards?.totals?.claimableUsd ?? 0),
        )
        .catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [address, isConnected]);
  return (
    <Link href="/earnings" className="earningsNavLink">
      Rewards
      {isConnected && claimable > 0 ? (
        <mark>${claimable.toFixed(2)}</mark>
      ) : null}
    </Link>
  );
}
