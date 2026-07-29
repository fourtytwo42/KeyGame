import type { Metadata } from "next";
import { LiveGame } from "@/components/live-game";
import { getScenario } from "@/lib/game/scenarios";

export const metadata: Metadata = {
  title: "Live Round 4663",
  description: "Watch the bell move live and make the next call.",
};

export default async function PlayRoundPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string }>;
  searchParams: Promise<{ scenario?: string }>;
}) {
  const [{ roundId }, query] = await Promise.all([params, searchParams]);
  const scenario = getScenario(query.scenario);

  return (
    <div className="playPage">
      <h1 className="srOnly">Last Bell Round {roundId}</h1>
      <LiveGame initialScenario={scenario.id} />
    </div>
  );
}
