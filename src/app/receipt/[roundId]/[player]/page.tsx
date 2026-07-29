import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ShareReceipt } from "@/components/share-receipt";
import { formatUsd, shortAddress } from "@/lib/game/constants";
import { scenarios } from "@/lib/game/scenarios";

export const metadata: Metadata = {
  title: "Final Holder Receipt",
  description: "The canonical receipt for Last Bell Round 4663.",
};

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ roundId: string; player: string }>;
}) {
  const { roundId, player } = await params;
  const state = scenarios.settled.state;
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
            {isWinner ? "FINAL HOLDER" : "EXIT LIQUIDITY"}
          </span>
          <h1>
            {isWinner ? "Rug pulled.\nBell kept." : "Cooked.\nStill on tape."}
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
            <dt>Faction</dt>
            <dd>{isWinner ? state.holder?.faction : "—"}</dd>
          </div>
          <div>
            <dt>Final pot</dt>
            <dd>{formatUsd(state.potUsd)}</dd>
          </div>
          <div>
            <dt>Tape status</dt>
            <dd>Settled</dd>
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
