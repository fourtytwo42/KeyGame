"use client";

import { useEffect, useState } from "react";

type RpcIndicator = "checking" | "healthy" | "degraded";

export function OnAirStatus() {
  const [status, setStatus] = useState<RpcIndicator>("checking");

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const response = await fetch("/api/status", { cache: "no-store" });
        const payload = (await response.json()) as {
          ok?: boolean;
          mode?: string;
          rpc?: { connectionStatus?: "healthy" | "degraded" };
        };
        if (mounted) {
          const localRuntimeHealthy =
            payload.ok === true &&
            (payload.mode === "devnet" || payload.mode === "simulator");
          setStatus(
            response.ok &&
              (payload.rpc?.connectionStatus === "healthy" ||
                localRuntimeHealthy)
              ? "healthy"
              : "degraded",
          );
        }
      } catch {
        if (mounted) setStatus("degraded");
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), 10_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  const label =
    status === "healthy"
      ? "BELL LIVE"
      : status === "degraded"
        ? "CONNECTION DEGRADED"
        : "CHECKING BELL";
  return (
    <div
      className="onAirBug"
      data-status={status}
      aria-label={`LAN RPC ${status}`}
    >
      <span className="onAirLamp" />
      {label}
    </div>
  );
}
