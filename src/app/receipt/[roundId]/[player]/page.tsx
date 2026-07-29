import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ShareReceipt } from "@/components/share-receipt";
import { formatUsd, shortAddress } from "@/lib/game/constants";
import { scenarios } from "@/lib/game/scenarios";
import { getDevnetSnapshot } from "@/lib/web3/devnet";

export const metadata: Metadata = {
  title: "Final Holder Receipt",
  description: "The canonical receipt for Last Bell Round 4663.",
};
export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ roundId: string; player: string }>;
}) {
  const { roundId, player } = await params;
  const state =
    process.env.NEXT_PUBLIC_GAME_MODE === "devnet"
      ? await getDevnetSnapshot()
      : scenarios.settled.state;
  const isWinner =
    state.holder?.address.toLowerCase() === player.toLowerCase() ||
    player === "demo";

  return (
    <div className="receiptPage">
      <article className="receiptCard">
        <div className="receiptTop">
          <span>CHANNEL 4663</span>
          <strong>ROUND {roundId}</strong>
          <span>FINAL TAPE</span>
        </div>
        <div className="receiptHero">
          <Image
            src="/brand/last-bell-mascot.png"
            alt=""
            width={210}
            height={210}
          />
          <span className="eyebrow">
            {isWinner ? "FINAL HOLDER" : "ON THE TAPE"}
          </span>
          <h1>
            {isWinner ? "Bag secured.\nBell kept." : "Cooked.\nStill on tape."}
          </h1>
          <p>
            {isWinner
              ? `${state.holder?.displayName} held the last accepted bell.`
              : `${shortAddress(player)} appeared in the trenches.`}
          </p>
        </div>
        <div className="receiptAmount">
          <span>{isWinner ? "BROADCAST PAYOUT" : "BROADCAST PAYOUT"}</span>
          <strong>{formatUsd(isWinner ? state.potUsd * 0.5 : 0)}</strong>
        </div>
        <dl className="receiptDetails">
          <div>
            <dt>Round</dt>
            <dd>#{roundId}</dd>
          </div>
          <div>
            <dt>Ticker on air</dt>
            <dd>{isWinner ? state.holder?.ticker : "—"}</dd>
          </div>
          <div>
            <dt>Locked market score</dt>
            <dd>
              {isWinner
                ? `${state.holder?.band} · ${((state.holder?.multiplierBps ?? 10_000) / 10_000).toFixed(2)}×`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Final pot</dt>
            <dd>{formatUsd(state.potUsd)}</dd>
          </div>
          <div>
            <dt>Tape status</dt>
            <dd>{state.phase.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Chain</dt>
            <dd>{state.chainId ?? "SIM"}</dd>
          </div>
          <div>
            <dt>Block</dt>
            <dd>{state.blockNumber ?? "SIM"}</dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>
              {state.contractAddress
                ? shortAddress(state.contractAddress)
                : "LOCAL"}
            </dd>
          </div>
        </dl>
        <div className="receiptRip" aria-hidden="true" />
      </article>
      <div className="receiptActions">
        <ShareReceipt />
        <Link
          className="secondaryAction linkAction"
          href={`/replay/${roundId}`}
        >
          WATCH THE TAPE
        </Link>
      </div>
      <p className="receiptDisclaimer">
        Devnet receipt. No real asset, payout, or brokerage position exists.
      </p>
    </div>
  );
}
