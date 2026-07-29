import Image from "next/image";
import Link from "next/link";
import { formatUsd, roundConfig } from "@/lib/game/constants";

export default function HomePage() {
  return (
    <div className="homePage">
      <section className="heroBroadcast">
        <div className="heroCopy">
          <span className="eyebrow">A LIVE ONCHAIN MARKET GAME SHOW</span>
          <h1>
            The last caller
            <br />
            keeps the bell.
          </h1>
          <p>
            Pick one ticker bag. Pay $1 to take the bell. Hold it when the clock
            hits zero and win half the pot.
          </p>
          <div className="heroActions">
            <Link className="primaryAction linkAction" href="/play/4663">
              WATCH ROUND 4663
            </Link>
            <Link className="secondaryAction linkAction" href="/rules">
              RULES IN 30 SECONDS
            </Link>
          </div>
          <p className="actionFinePrint">
            Spectate without a wallet. Local devnet uses play tokens only.
          </p>
        </div>
        <div className="heroSet" aria-label="Next broadcast">
          <div className="heroSetTop">
            <span>TONIGHT</span>
            <strong>CHANNEL 4663</strong>
          </div>
          <Image
            src="/brand/last-bell-mascot.png"
            alt="An anxious hand bell tied to a market bag"
            width={520}
            height={520}
            priority
          />
          <div className="heroPrize">
            <span>STARTING POT</span>
            <strong>{formatUsd(50)}</strong>
          </div>
        </div>
      </section>

      <section className="threeRules" aria-labelledby="rules-at-a-glance">
        <div className="sectionSlug">
          <span>THE WHOLE FORMAT</span>
          <h2 id="rules-at-a-glance">Three moves. One bad idea.</h2>
        </div>
        <div className="rulePanels">
          <article>
            <span>01</span>
            <h3>Pick a bag</h3>
            <p>Join NVDA, AAPL, TSLA, or SPY for the entire round.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Ape for $1</h3>
            <p>Every accepted call takes the bell and grows the pot.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Hold at zero</h3>
            <p>The final holder wins 50%. Top faction shares 30%.</p>
          </article>
        </div>
      </section>

      <section className="nextRoundBoard">
        <div>
          <span className="eyebrow">NEXT LIVE TRANSMISSION</span>
          <h2>Round {roundConfig.roundId}</h2>
          <p>45 seconds on the clock. Four bags. No extensions in Rug Zone.</p>
        </div>
        <div className="roundFacts">
          <div>
            <span>CALL</span>
            <strong>$1</strong>
          </div>
          <div>
            <span>FINAL HOLDER</span>
            <strong>50%</strong>
          </div>
          <div>
            <span>FACTION</span>
            <strong>30%</strong>
          </div>
        </div>
        <Link
          className="primaryAction linkAction"
          href="/play/4663?scenario=entry"
        >
          ENTER THE STUDIO
        </Link>
      </section>
    </div>
  );
}
