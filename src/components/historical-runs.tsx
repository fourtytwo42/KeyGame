"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/game/constants";
import type { HistoricalRunSummary } from "@/lib/game/history-types";

export function HistoricalRuns() {
  const [runs, setRuns] = useState<HistoricalRunSummary[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      try {
        const response = await fetch("/api/history", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          runs: HistoricalRunSummary[];
        };
        if (active) {
          setRuns(payload.runs);
          setReady(true);
        }
      } catch {
        if (active) setReady(true);
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="historicalRuns" aria-labelledby="historical-runs-title">
      <header>
        <span className="eyebrow">ARCHIVE TAPE / COMPLETED BROADCASTS</span>
        <h2 id="historical-runs-title">Historical runs</h2>
        <p>
          See how large each pot became, who held the final bell, and which
          stock won the Closing Print.
        </p>
      </header>
      {runs.length ? (
        <div className="historicalRunGrid">
          {runs.map((run) => (
            <Link
              className="historicalRunCard"
              href={`/replay/${run.id}`}
              key={run.id}
            >
              <span>ROUND {run.roundId}</span>
              <strong>{formatUsd(run.peakPotUsd)} PEAK POT</strong>
              <dl>
                <div>
                  <dt>Final caller</dt>
                  <dd>{run.finalHolder}</dd>
                </div>
                <div>
                  <dt>Closing Print</dt>
                  <dd>{run.winningTicker ?? "NO WINNER"}</dd>
                </div>
                <div>
                  <dt>Calls</dt>
                  <dd>{run.claimCount}</dd>
                </div>
              </dl>
              <small>OPEN FULL RUN →</small>
            </Link>
          ))}
        </div>
      ) : (
        <p className="emptyHistory">
          {ready
            ? "No completed broadcasts yet. The first finished run will appear here automatically."
            : "Checking the archive tape…"}
        </p>
      )}
    </section>
  );
}
