"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useDisconnect } from "wagmi";

export function UatControls({
  address,
  onFunded,
}: {
  address: Address;
  onFunded?: () => void | Promise<void>;
}) {
  const { disconnect } = useDisconnect();
  const [funding, setFunding] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <div className="tapeNotice">
      <strong>UAT WALLET · TESTNET ONLY · NO VALUE</strong>
      <span>
        The signing key exists only in this browser session and is never sent to
        the server.
      </span>
      <button
        className="secondaryAction fullWidth"
        type="button"
        disabled={funding}
        onClick={async () => {
          setFunding(true);
          setMessage("");
          try {
            const response = await fetch("/api/uat/fund", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ address }),
            });
            const payload = (await response.json()) as { error?: string };
            if (!response.ok) {
              throw new Error(payload.error || "Funding failed.");
            }
            await onFunded?.();
            setMessage("Test ETH and mock USDG funded.");
          } catch (cause) {
            setMessage(
              cause instanceof Error ? cause.message : "Funding failed.",
            );
          } finally {
            setFunding(false);
          }
        }}
      >
        {funding ? "FUNDING…" : "FUND TEST WALLET"}
      </button>
      <button
        className="textButton"
        type="button"
        onClick={() => void navigator.clipboard.writeText(address)}
      >
        Copy test wallet address
      </button>
      <button
        className="textButton danger"
        type="button"
        onClick={() => {
          window.sessionStorage.removeItem("keygame:uat-testnet-wallet");
          disconnect();
          window.location.reload();
        }}
      >
        Reset test wallet
      </button>
      {message ? <span>{message}</span> : null}
    </div>
  );
}
