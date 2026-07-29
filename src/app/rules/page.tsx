import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { roundConfig } from "@/lib/game/constants";
import { devDollarAddress, roundAddress } from "@/lib/web3/devnet";

export const metadata: Metadata = { title: "Rules" };

export default function RulesPage() {
  return (
    <InfoPage
      eyebrow="STATION HANDBOOK / REV 4663"
      title="Rules without the lore"
      intro="The interface uses meme language. The chain uses these literal rules."
    >
      <section>
        <span className="chapterNumber">01</span>
        <div>
          <h2>Pick a ticker on every call</h2>
          <p>
            Entry selection is your first paid call, not a permanent team. A
            later accepted claim may put any other roster ticker on air.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">02</span>
        <div>
          <h2>Take the bell for $1</h2>
          <p>
            Each accepted claim costs {roundConfig.claimPriceUsd} play USD,
            changes the holder, and grows the pot. The current holder cannot
            claim their own bell.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">03</span>
        <div>
          <h2>The clock gets two seconds, until it does not</h2>
          <p>
            Normal claims add {roundConfig.extensionSeconds} seconds without
            crossing the {roundConfig.hardCapSeconds}-second hard cap. At{" "}
            {roundConfig.rugZoneSeconds} seconds the Rug Zone begins. Claims
            still change the holder but add no time.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">04</span>
        <div>
          <h2>Zero freezes the tape</h2>
          <p>
            The interface never names a winner at zero. It first waits for
            settlement. The final accepted holder receives 50%. The
            market-weighted Closing Print ticker receives a 30% contributor
            pool, 15% seeds the next round, and 5% funds the protocol.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">05</span>
        <div>
          <h2>Momentum locks for each holder interval</h2>
          <p>
            A verified move of at least +5 bps scores 1.25×, between the bands
            scores 1×, and at most -5 bps scores 0.75×. The multiplier locks
            when the claim lands and cannot change retroactively.
          </p>
        </div>
      </section>
      <section>
        <span className="chapterNumber">06</span>
        <div>
          <h2>One reusable approval</h2>
          <p>
            The first paid call asks for a $100 play-USDG allowance only when
            the current allowance is below $10. Each accepted call consumes
            exactly $1. You can change or revoke the allowance in your wallet at
            any time; revoking prevents further calls but does not undo accepted
            calls.
          </p>
        </div>
      </section>
      <div className="constantTape">
        <span>START 45s</span>
        <span>EXTEND +2s</span>
        <span>RUG ≤10s</span>
        <span>HARD STOP 180s</span>
        <span>CALL $1</span>
      </div>
      <div className="disclosureBlock">
        <span className="chapterNumber">ID</span>
        <div>
          <h2>Canonical devnet identities</h2>
          <p>Round contract: {roundAddress}</p>
          <p>Play USDG: {devDollarAddress}</p>
          <p>
            Mock Stock Tokens power Producer Pass on devnet. No Stock Token is
            deposited, locked, traded, or awarded by the game contract.
          </p>
        </div>
      </div>
    </InfoPage>
  );
}
