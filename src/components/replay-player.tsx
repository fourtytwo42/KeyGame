"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/game/constants";
import { tickerById } from "@/lib/game/scenarios";
import type { RoundState } from "@/lib/game/types";

export function ReplayPlayer({ state }: { state: RoundState }) {
  const tape = state.claims;
  const [index, setIndex] = useState(tape.length - 1);
  const event = tape[index];

  if (!event) {
    return (
      <p className="emptyTape">No accepted claims are on this tape yet.</p>
    );
  }

  return (
    <div className="replayPlayer">
      <div className="replayMonitor">
        <span className="eyebrow">
          TAPE {String(index + 1).padStart(2, "0")} /{" "}
          {String(tape.length).padStart(2, "0")}
        </span>
        <div className="replayClock">
          00:{event.timeAfterSeconds.toString().padStart(2, "0")}
        </div>
        <span
          className="tickerBadge large"
          style={{ background: tickerById(event.claimant.ticker).color }}
        >
          {event.claimant.ticker}
        </span>
        <h2>{event.claimant.displayName}</h2>
        <p>
          PUTS IT ON AIR · {event.marketBand} ·{" "}
          {(event.multiplierBps / 10_000).toFixed(2)}×
        </p>
        {state.contractVersion === "closing-print-v3-airtime" ? (
          <p>
            CROWN: WEIGHTED POINTS · PAYOUT: {event.intervalSeconds ?? 0} RAW
            AIRTIME SEC
          </p>
        ) : null}
        <dl className="replayProof">
          <div>
            <dt>Locked interval</dt>
            <dd>
              {event.intervalSeconds ?? 0}s ·{" "}
              {(event.weightedPoints ?? 0).toFixed(2)} PT
            </dd>
          </div>
          <div>
            <dt>Ticker switch</dt>
            <dd>
              {event.previousTicker ?? "OPEN"} → {event.claimant.ticker}
            </dd>
          </div>
          <div>
            <dt>Market proof</dt>
            <dd>
              {state.marketMode === "FLAT"
                ? "FLAT ROUND · NO REPORT REQUIRED"
                : `${event.verifiedPrice.toFixed(4)} · ${new Date(
                    event.reportTimestamp * 1000,
                  ).toLocaleString()}`}
            </dd>
          </div>
          <div>
            <dt>Chain proof</dt>
            <dd>
              BLOCK {event.blockNumber ?? "—"} · TX{" "}
              <code>{event.transactionHash ?? "—"}</code>
            </dd>
          </div>
        </dl>
        <strong>{formatUsd(event.potAfterUsd)} POT</strong>
      </div>
      <div className="replayControls">
        <button
          type="button"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
          aria-label="Previous accepted claim"
        >
          ◀ PREV
        </button>
        <input
          type="range"
          min={0}
          max={tape.length - 1}
          value={index}
          onChange={(event) => setIndex(Number(event.target.value))}
          aria-label="Replay position"
        />
        <button
          type="button"
          onClick={() =>
            setIndex((current) => Math.min(tape.length - 1, current + 1))
          }
          disabled={index === tape.length - 1}
          aria-label="Next accepted claim"
        >
          NEXT ▶
        </button>
      </div>
      <ol className="replayTape">
        {tape.map((claim, tapeIndex) => (
          <li key={claim.id} data-active={tapeIndex === index}>
            <button type="button" onClick={() => setIndex(tapeIndex)}>
              <span>#{claim.sequence}</span>
              <strong>{claim.claimant.displayName}</strong>
              <small>
                {claim.claimant.ticker} · {claim.intervalSeconds ?? 0}s ·{" "}
                {claim.weightedPoints?.toFixed(2) ?? "—"} PT
              </small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
