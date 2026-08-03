import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoundRewardPanel } from "@/components/round-reward-panel";
import { ShareReceipt } from "@/components/share-receipt";
import { formatUsd, shortAddress } from "@/lib/game/constants";
import { scenarios } from "@/lib/game/scenarios";
import { getIndexedHistoricalRunByRoundId } from "@/lib/server/indexed-history";
import { getDevnetSnapshot } from "@/lib/web3/devnet";

export const metadata: Metadata = {
  title: "Final Holder Receipt",
  description: "The canonical receipt for Saved by the Bell Round 4663.",
};
export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ roundId: string; player: string }>;
}) {
  const { roundId, player } = await params;
  const mode = process.env.NEXT_PUBLIC_GAME_MODE;
  const indexed =
    mode === "testnet" || mode === "mainnet"
      ? await getIndexedHistoricalRunByRoundId(roundId)
      : undefined;
  if ((mode === "testnet" || mode === "mainnet") && !indexed) notFound();
  const state = indexed
    ? indexed.state
    : mode === "devnet"
      ? await getDevnetSnapshot()
      : scenarios.settled.state;
  const isWinner =
    state.holder?.address.toLowerCase() === player.toLowerCase() ||
    player === "demo";
  const isAirtimeVersion = state.contractVersion === "closing-print-v3-airtime";
  const callerClaims = state.claims.filter(
    (claim) =>
      player === "demo" ||
      claim.claimant.address.toLowerCase() === player.toLowerCase(),
  );
  const playerRawSeconds = callerClaims.reduce(
    (total, claim) => total + (claim.intervalSeconds ?? 0),
    0,
  );
  const totalRawSeconds = state.claims.reduce(
    (total, claim) => total + (claim.intervalSeconds ?? 0),
    0,
  );
  const legacyEligibleSeconds = callerClaims
    .filter((claim) => claim.claimant.ticker === state.winningTicker)
    .reduce((total, claim) => total + (claim.intervalSeconds ?? 0), 0);
  const legacyTotalSeconds = state.claims
    .filter((claim) => claim.claimant.ticker === state.winningTicker)
    .reduce((total, claim) => total + (claim.intervalSeconds ?? 0), 0);
  const eligibleSeconds = isAirtimeVersion
    ? playerRawSeconds
    : legacyEligibleSeconds;
  const eligibleTotal = isAirtimeVersion ? totalRawSeconds : legacyTotalSeconds;
  const airtimeReward =
    eligibleTotal > 0
      ? (state.potUsd * 0.3 * eligibleSeconds) / eligibleTotal
      : 0;
  const receiptReward = (isWinner ? state.potUsd * 0.5 : 0) + airtimeReward;

  return (
    <div className="receiptPage">
      <article className="receiptCard">
        <div className="receiptTop">
          <span>SAVED BY THE BELL</span>
          <strong>ROUND {roundId}</strong>
          <span>FINAL TAPE</span>
        </div>
        <div className="receiptHero">
          <Image
            src="/brand/saved-bell-mascot.png"
            alt=""
            width={210}
            height={210}
          />
          <span className="eyebrow">
            {isWinner ? "FINAL HOLDER" : "AIRTIME CALLER"}
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
          <span>PROJECTED BROADCAST PAYOUT</span>
          <strong>{formatUsd(receiptReward)}</strong>
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
            <dt>Airtime Pool seconds</dt>
            <dd>
              {eligibleSeconds}s / {eligibleTotal}s
            </dd>
          </div>
          <div>
            <dt>Closing Print Crown</dt>
            <dd>{state.winningTicker ?? "—"}</dd>
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
      {mode === "testnet" || mode === "mainnet" ? (
        <RoundRewardPanel state={state} />
      ) : null}
      <p className="receiptDisclaimer">
        Devnet receipt. No real asset, payout, or brokerage position exists.
      </p>
    </div>
  );
}
