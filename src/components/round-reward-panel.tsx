"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/game/constants";
import type { RoundState } from "@/lib/game/types";
import { useWalletGame } from "@/lib/web3/use-wallet-game";

export function RoundRewardPanel({ state }: { state: RoundState }) {
  const wallet = useWalletGame(state.contractAddress);
  const [message, setMessage] = useState("");
  const busy = wallet.action !== "idle";

  const claim = async (kind: "holder" | "print") => {
    setMessage("");
    try {
      await wallet.claimReward(kind);
      setMessage("Reward withdrawal confirmed onchain.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Claim failed.");
    }
  };

  return (
    <section className="roundRewardPanel" aria-label="Round rewards">
      <span className="eyebrow">PULL-PAYMENT WINDOW</span>
      <h2>Withdraw your round rewards</h2>
      {!wallet.isConnected ? (
        <p>Connect the winning wallet in the header to check and withdraw.</p>
      ) : wallet.claimable.holderUsd === 0 &&
        wallet.claimable.closingPrintUsd === 0 ? (
        <p>No unclaimed reward is available for this connected wallet.</p>
      ) : (
        <div>
          {wallet.claimable.holderUsd > 0 ? (
            <button
              className="primaryAction"
              type="button"
              disabled={busy}
              onClick={() => void claim("holder")}
            >
              CLAIM FINAL HOLDER · {formatUsd(wallet.claimable.holderUsd)}
            </button>
          ) : null}
          {wallet.claimable.closingPrintUsd > 0 ? (
            <button
              className="secondaryAction"
              type="button"
              disabled={busy}
              onClick={() => void claim("print")}
            >
              CLAIM CLOSING PRINT ·{" "}
              {formatUsd(wallet.claimable.closingPrintUsd)}
            </button>
          ) : null}
        </div>
      )}
      {message ? <p aria-live="polite">{message}</p> : null}
    </section>
  );
}
