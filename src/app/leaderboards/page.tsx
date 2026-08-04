import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Rankings" };
export const dynamic = "force-dynamic";

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; metric?: string }>;
}) {
  const selected = await searchParams;
  const scope = ["round", "season", "lifetime"].includes(selected.scope ?? "")
    ? selected.scope!
    : "round";
  const metric = [
    "points",
    "settled-volume",
    "largest-call",
    "captain-wins",
    "stock-flips",
    "final-bells",
    "claimed-rewards",
  ].includes(selected.metric ?? "")
    ? selected.metric!
    : "points";
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
  const payload = (await fetch(
    `${base}/api/leaderboards?scope=${scope}&metric=${metric}`,
    {
      cache: "no-store",
    },
  ).then((response) => response.json())) as {
    rows?: Array<{
      rank: number;
      displayName: string;
      value: number;
      settledUsdgContributed: number;
      largestCall: number;
      captainWins?: number;
      stockFlips?: number;
      finalBells?: number;
      claimedRewards?: number;
    }>;
  };
  const metricValue = (entry: NonNullable<typeof payload.rows>[number]) => {
    if (metric === "settled-volume")
      return `$${entry.settledUsdgContributed.toLocaleString()}`;
    if (metric === "largest-call")
      return `$${entry.largestCall.toLocaleString()}`;
    if (metric === "captain-wins")
      return `${entry.captainWins ?? 0} CAPTAIN WINS`;
    if (metric === "stock-flips") return `${entry.stockFlips ?? 0} FLIPS`;
    if (metric === "final-bells") return `${entry.finalBells ?? 0} FINAL BELLS`;
    if (metric === "claimed-rewards")
      return `$${(entry.claimedRewards ?? 0).toLocaleString()} CLAIMED`;
    return `${entry.value.toLocaleString()} PTS`;
  };
  return (
    <InfoPage
      eyebrow="HALL OF FAME / STATUS ONLY"
      title="Rankings"
      intro="Points, volume, and biggest calls earn status. They do not add another payout multiplier."
    >
      <nav className="leaderboardScopes" aria-label="Leaderboard scope">
        {["round", "season", "lifetime"].map((item) => (
          <Link
            key={item}
            data-selected={scope === item}
            href={`/leaderboards?scope=${item}&metric=${metric}`}
          >
            {item.toUpperCase()}
          </Link>
        ))}
      </nav>
      <nav className="leaderboardMetrics" aria-label="Leaderboard metric">
        {[
          "points",
          "settled-volume",
          "largest-call",
          "captain-wins",
          "stock-flips",
          "final-bells",
          "claimed-rewards",
        ].map((item) => (
          <Link
            key={item}
            data-selected={metric === item}
            href={`/leaderboards?scope=${scope}&metric=${item}`}
          >
            {item.replaceAll("-", " ").toUpperCase()}
          </Link>
        ))}
      </nav>
      <div className="leaderboardTable">
        {(payload.rows ?? []).map((entry) => (
          <article key={`${entry.rank}-${entry.displayName}`}>
            <strong>#{entry.rank}</strong>
            <span>{entry.displayName}</span>
            <span className="leaderboardPrimaryMetric">
              {metricValue(entry)}
            </span>
            <span>${entry.settledUsdgContributed.toLocaleString()} APE’D</span>
            <span>${entry.largestCall.toLocaleString()} BIGGEST</span>
          </article>
        ))}
      </div>
    </InfoPage>
  );
}
