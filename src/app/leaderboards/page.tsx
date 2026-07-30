import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Leaderboards" };
export const dynamic = "force-dynamic";

export default async function LeaderboardsPage() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
  const payload = (await fetch(`${base}/api/leaderboards`, {
    cache: "no-store",
  }).then((response) => response.json())) as {
    round?: Array<{
      rank: number;
      displayName: string;
      value: number;
      settledUsdgContributed: number;
      largestCall: number;
    }>;
  };
  return (
    <InfoPage
      eyebrow="WHALE TAPE / STATUS ONLY"
      title="Leaderboards"
      intro="Points, volume, and biggest calls earn status. They do not add another payout multiplier."
    >
      <div className="leaderboardTable">
        {(payload.round ?? []).map((entry) => (
          <article key={`${entry.rank}-${entry.displayName}`}>
            <strong>#{entry.rank}</strong>
            <span>{entry.displayName}</span>
            <span>{entry.value.toLocaleString()} PTS</span>
            <span>${entry.settledUsdgContributed.toLocaleString()} APE’D</span>
            <span>${entry.largestCall.toLocaleString()} BIGGEST</span>
          </article>
        ))}
      </div>
    </InfoPage>
  );
}
