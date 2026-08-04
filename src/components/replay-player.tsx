"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/game/constants";
import { tickerById } from "@/lib/game/scenarios";
import type { RoundState } from "@/lib/game/types";
import {
  deriveAchievements,
  deriveTickerCaptains,
} from "@/lib/game/highlights";
import { OnchainVerification } from "./onchain-verification";

export function ReplayPlayer({ state }: { state: RoundState }) {
  const stockPotVersion =
    state.contractVersion === "saved-bell-v5-market-pot" ||
    state.contractVersion === "last-bell-v4-stock-pot";
  const tape = state.claims;
  const [index, setIndex] = useState(tape.length - 1);
  const event = tape[index];
  const achievements = event
    ? deriveAchievements(state).filter(
        (item) =>
          item.player.toLowerCase() === event.claimant.address.toLowerCase(),
      )
    : [];
  const captain = event
    ? deriveTickerCaptains(state).find(
        (item) => item.ticker === event.claimant.ticker,
      )
    : undefined;

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
        <div className="replayClock">{`${Math.floor(event.timeAfterSeconds / 60)
          .toString()
          .padStart(2, "0")}:${Math.floor(event.timeAfterSeconds % 60)
          .toString()
          .padStart(2, "0")}`}</div>
        <span
          className="tickerBadge large"
          style={{ background: tickerById(event.claimant.ticker).color }}
        >
          {event.claimant.ticker}
        </span>
        <h2>{event.claimant.displayName}</h2>
        <p>
          {stockPotVersion
            ? `APED ${formatUsd(event.usdgAmount ?? 0)} ON ${event.claimant.ticker} · ${(event.multiplierBps / 10_000).toFixed(2)}× · ${(event.pointsAwarded ?? 0).toLocaleString()} PTS`
            : `PUTS IT ON AIR · ${event.marketBand} · ${(event.multiplierBps / 10_000).toFixed(2)}×`}
        </p>
        {captain?.address.toLowerCase() ===
        event.claimant.address.toLowerCase() ? (
          <span className="captainStamp">STOCK CAPTAIN · {captain.ticker}</span>
        ) : null}
        {achievements.length ? (
          <div className="achievementBadges">
            {achievements.map((achievement) => (
              <span key={achievement.id}>{achievement.title}</span>
            ))}
          </div>
        ) : null}
        {state.contractVersion === "closing-print-v3-airtime" ? (
          <p>
            CROWN: WEIGHTED POINTS · PAYOUT: {event.intervalSeconds ?? 0} RAW
            AIRTIME SEC
          </p>
        ) : null}
        <dl className="replayProof">
          <div>
            <dt>{stockPotVersion ? "Stock purchase" : "Locked interval"}</dt>
            <dd>
              {stockPotVersion
                ? `${formatUsd(event.usdgAmount ?? 0)} → ${(event.stockReceived ?? 0).toLocaleString()} ${event.claimant.ticker}`
                : `${event.intervalSeconds ?? 0}s · ${(event.weightedPoints ?? 0).toFixed(2)} PT`}
            </dd>
          </div>
          <div>
            <dt>Ticker switch</dt>
            <dd>
              {event.previousTicker ?? "OPEN"} → {event.claimant.ticker}
            </dd>
          </div>
          <div>
            <dt>{stockPotVersion ? "Point proof" : "Market proof"}</dt>
            <dd>
              {stockPotVersion
                ? `${(event.multiplierBps / 10_000).toFixed(2)}× · ${(event.pointsAwarded ?? 0).toLocaleString()} PTS`
                : state.marketMode === "FLAT"
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
                {stockPotVersion
                  ? `${claim.claimant.ticker} · ${formatUsd(claim.usdgAmount ?? 0)} · ${(claim.pointsAwarded ?? 0).toLocaleString()} PT`
                  : `${claim.claimant.ticker} · ${claim.intervalSeconds ?? 0}s · ${claim.weightedPoints?.toFixed(2) ?? "—"} PT`}
              </small>
            </button>
          </li>
        ))}
      </ol>
      <OnchainVerification
        state={state}
        playerNumerator={event.pointsAwarded ?? 0}
        totalDenominator={
          state.tickerScores.find(
            (score) => score.ticker === event.claimant.ticker,
          )?.weightedScore ?? 0
        }
      />
    </div>
  );
}
