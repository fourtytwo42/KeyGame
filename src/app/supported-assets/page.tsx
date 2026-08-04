import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { tickerSlots } from "@/lib/game/constants";

export const metadata: Metadata = { title: "Bell Rush Stocks" };

export default function SupportedAssetsPage() {
  return (
    <InfoPage
      eyebrow="BELL RUSH / STOCK LINEUP"
      title="Pick your stock"
      intro="Choose an amount and a stock. Your USDG buys that Stock Token for the round pot, awards points, and takes the bell."
    >
      <section className="bagRoster" aria-labelledby="bag-roster-title">
        <div className="bagRosterHeader">
          <div>
            <span className="eyebrow">FOUR STOCKS · ONE BELL</span>
            <h2 id="bag-roster-title">The Stock Race</h2>
          </div>
          <p>
            Recent buys heat a stock for followers. The 30-second multiplier
            changes points, never the final-caller prize.
          </p>
        </div>

        <div className="assetGrid">
          {tickerSlots.map((ticker) => (
            <article
              className="assetCard"
              data-band="FLAT"
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
                  ROSTER {String(ticker.volatilityRank).padStart(2, "0")}
                </span>
                <strong>STOCK POT</strong>
              </div>
              <div className="assetIdentity">
                <span className="assetTicker">{ticker.id}</span>
                <div>
                  <h3>{ticker.name}</h3>
                  <p>{ticker.assetName}</p>
                </div>
              </div>
              <div className="momentumDial" aria-label="Volume heat scale">
                <span>1.00×</span>
                <span>FOLLOWERS HEAT UP</span>
                <span>2.00× CAP</span>
              </div>
              <dl className="assetStats">
                <div>
                  <dt>Points</dt>
                  <dd>USDG × HEAT</dd>
                  <small>Multiplier locks before your buy</small>
                </div>
                <div>
                  <dt>Heat window</dt>
                  <dd>30 SECONDS</dd>
                  <small>$4,000 reaches 2.00×</small>
                </div>
              </dl>
              <div className="assetCallout">
                <strong>APE ON {ticker.id} · $1 MIN · NO MAX</strong>
                <p>
                  Your call buys {ticker.id} for the basket. If it finishes with
                  the most points, its backers split 30% by their points.
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="disclosureBlock">
        <span className="chapterNumber">!</span>
        <div>
          <h2>Know what you are picking</h2>
          <p>
            Devnet and testnet Stock Tokens have no value. The game contract
            accounts only for tokens returned by its approved mock swap adapter.
            A real-money launch still requires verified canonical assets,
            security review, eligibility design, and current legal approval.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}
