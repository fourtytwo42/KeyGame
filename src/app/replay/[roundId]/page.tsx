import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReplayPlayer } from "@/components/replay-player";
import { RoundRewardPanel } from "@/components/round-reward-panel";
import { getHistoricalRun } from "@/lib/game/history";
import { scenarios } from "@/lib/game/scenarios";
import { getIndexedHistoricalRun } from "@/lib/server/indexed-history";
import { getDevnetSnapshot } from "@/lib/web3/devnet";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ roundId: string }>;
}): Promise<Metadata> {
  const { roundId } = await params;
  return { title: `Replay Round ${roundId}` };
}

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;
  const mode = process.env.NEXT_PUBLIC_GAME_MODE;
  const archivedRun =
    mode === "testnet" || mode === "mainnet"
      ? await getIndexedHistoricalRun(roundId)
      : await getHistoricalRun(roundId);
  if ((mode === "testnet" || mode === "mainnet") && !archivedRun) {
    notFound();
  }
  const state = archivedRun
    ? archivedRun.state
    : process.env.NEXT_PUBLIC_GAME_MODE === "devnet"
      ? await getDevnetSnapshot()
      : scenarios.settled.state;
  const displayRoundId = archivedRun?.roundId ?? roundId;

  return (
    <div className="replayPage">
      <header className="pageTitleBar">
        <div>
          <span className="eyebrow">ARCHIVE TAPE / CANONICAL ORDER</span>
          <h1>Round {displayRoundId} replay</h1>
          <p>
            Every accepted call in deterministic order. Rejected calls never
            rewrite the holder.
          </p>
        </div>
        <div className="finalStamp">
          <span>FINAL HOLDER</span>
          <strong>{state.holder?.displayName}</strong>
        </div>
      </header>
      <ReplayPlayer state={state} />
      <p className="canonicalProof">
        CHAIN {state.chainId ?? "SIM"} · CONTRACT{" "}
        {state.contractAddress ?? "LOCAL FIXTURE"} · BLOCK{" "}
        {state.blockNumber ?? "SIM"}
      </p>
      {mode === "testnet" || mode === "mainnet" ? (
        <RoundRewardPanel state={state} />
      ) : null}
      <div className="pageEndActions">
        <Link className="primaryAction linkAction" href="/?scenario=entry">
          RUN IT BACK
        </Link>
        <Link className="secondaryAction linkAction" href="/rules">
          VERIFY THE RULES
        </Link>
      </div>
    </div>
  );
}
