import type { Metadata } from "next";
import Link from "next/link";
import { ReplayPlayer } from "@/components/replay-player";
import { scenarios } from "@/lib/game/scenarios";
import { getDevnetSnapshot } from "@/lib/web3/devnet";

export const metadata: Metadata = { title: "Replay Round 4663" };
export const dynamic = "force-dynamic";

export default async function ReplayPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;
  const state =
    process.env.NEXT_PUBLIC_GAME_MODE === "devnet"
      ? await getDevnetSnapshot()
      : scenarios.settled.state;

  return (
    <div className="replayPage">
      <header className="pageTitleBar">
        <div>
          <span className="eyebrow">ARCHIVE TAPE / CANONICAL ORDER</span>
          <h1>Round {roundId} replay</h1>
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
      <div className="pageEndActions">
        <Link
          className="primaryAction linkAction"
          href="/play/4663?scenario=entry"
        >
          RUN IT BACK
        </Link>
        <Link className="secondaryAction linkAction" href="/rules">
          VERIFY THE RULES
        </Link>
      </div>
    </div>
  );
}
