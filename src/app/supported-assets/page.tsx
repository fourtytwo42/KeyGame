import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { tickerSlots } from "@/lib/game/constants";

export const metadata: Metadata = { title: "Tonight's Stock Tokens" };

const bandCopy = {
  GREEN: {
    label: "Cooking",
    detail: "Momentum boost",
  },
  FLAT: {
    label: "Holding",
    detail: "Standard pace",
  },
  RED: {
    label: "Cooling",
    detail: "Momentum drag",
  },
} as const;

export default function SupportedAssetsPage() {
  return (
    <InfoPage
      eyebrow="TEAM SELECT / TONIGHT'S LINEUP"
      title="Pick your bag"
      intro="Every $1 call puts one stock on air. Hold the bell to build points for that stock. You can switch stocks the next time you call."
    >
      <section className="bagRoster" aria-labelledby="bag-roster-title">
        <div className="bagRosterHeader">
          <div>
            <span className="eyebrow">FOUR STOCKS · ONE BELL</span>
            <h2 id="bag-roster-title">Tonight&apos;s teams</h2>
          </div>
          <p>
            The multiplier changes point speed. It never changes the $1 call
            price or the final-caller prize.
          </p>
        </div>

        <div className="assetGrid">
          {tickerSlots.map((ticker) => {
            const band = bandCopy[ticker.currentBand];
            const multiplier = ticker.multiplierBps / 10_000;

            return (
              <article
                className="assetCard"
                data-band={ticker.currentBand}
                key={ticker.id}
                style={
                  {
                    "--faction": ticker.color,
                    "--faction-dark": ticker.secondary,
                  } as CSSProperties
                }
              >
                <div className="assetCardTopline">
                  <span>
                    TEAM {String(ticker.volatilityRank).padStart(2, "0")}
                  </span>
                  <strong>{band.label}</strong>
                </div>

                <div className="assetIdentity">
                  <span className="assetTicker">{ticker.id}</span>
                  <div>
                    <h3>{ticker.name}</h3>
                    <p>{ticker.assetName}</p>
                  </div>
                </div>

                <div
                  className="momentumDial"
                  aria-label={`${ticker.currentBand} momentum`}
                >
                  <span>COOLING</span>
                  <span>HOLDING</span>
                  <span>COOKING</span>
                </div>

                <dl className="assetStats">
                  <div>
                    <dt>Point speed</dt>
                    <dd>{multiplier.toFixed(2)}x</dd>
                    <small>{band.detail}</small>
                  </div>
                  <div>
                    <dt>30-minute heat</dt>
                    <dd>{(ticker.realizedMovementBps / 100).toFixed(2)}%</dd>
                    <small>Roster rank #{ticker.volatilityRank}</small>
                  </div>
                </dl>

                <div className="assetCallout">
                  <strong>PUT {ticker.id} ON AIR · $1</strong>
                  <p>
                    Each second on the bell earns {multiplier.toFixed(2)}{" "}
                    points. If {ticker.id} wins, your real airtime sets your
                    share.
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="disclosureBlock">
        <span className="chapterNumber">!</span>
        <div>
          <h2>Know what you are picking</h2>
          <p>
            These teams represent Stock Tokens in the game. Test versions have
            no value. Before a real-money launch, every supported token will
            include its issuer, eligibility, redemption, transfer, and
            market-hours details.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}
