import { ImageResponse } from "next/og";
import { scenarios } from "@/lib/game/scenarios";
import { getIndexedHistoricalRunByRoundId } from "@/lib/server/indexed-history";
import { deriveHighlights } from "@/lib/game/highlights";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ roundId: string; player: string }>;
}) {
  const { roundId, player } = await params;
  const indexed =
    process.env.NEXT_PUBLIC_GAME_MODE === "testnet" ||
    process.env.NEXT_PUBLIC_GAME_MODE === "mainnet"
      ? await getIndexedHistoricalRunByRoundId(roundId).catch(() => undefined)
      : undefined;
  const state = indexed?.state ?? scenarios.settled.state;
  const largest = Math.max(
    0,
    ...state.claims.map((claim) => claim.usdgAmount ?? 0),
  );
  const flips = deriveHighlights(state).filter(
    (item) => item.kind === "TICKER_FLIP",
  ).length;
  const last = state.claims.filter((claim) => claim.accepted).at(-1);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        color: "#121212",
        background: "#f3ff69",
        border: "28px solid #121212",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <b style={{ fontSize: 28 }}>SAVED BY THE BELL · RECEIPT</b>
        <b style={{ fontSize: 28 }}>SAVED BY THE BELL</b>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 118, fontWeight: 900 }}>ROUND {roundId}</span>
        <span style={{ fontSize: 44 }}>
          CALLER {player.slice(0, 10).toUpperCase()}
        </span>
      </div>
      <div style={{ display: "flex", gap: 24, fontSize: 27, fontWeight: 800 }}>
        <span>${state.potUsd.toLocaleString()} POT</span>
        <span>{state.winningTicker ?? "—"} WON</span>
        <span>${largest.toLocaleString()} BIGGEST</span>
        <span>{flips} FLIPS</span>
        <span>
          {last ? `${last.timeAfterSeconds.toFixed(1)}S LEFT` : "NO CALL"}
        </span>
      </div>
    </div>,
    size,
  );
}
