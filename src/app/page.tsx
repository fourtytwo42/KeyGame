import { HistoricalRuns } from "@/components/historical-runs";
import { LiveGame } from "@/components/live-game";
import { getScenario } from "@/lib/game/scenarios";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string }>;
}) {
  const query = await searchParams;
  const scenario = getScenario(query.scenario);

  return (
    <div className="gameHomePage">
      <section className="homeStudio" aria-label="Current Last Bell game">
        <h1 className="srOnly">Current Last Bell round</h1>
        <LiveGame initialScenario={scenario.id} />
      </section>
      <HistoricalRuns />
    </div>
  );
}
