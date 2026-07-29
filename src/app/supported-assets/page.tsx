import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { tickerSlots } from "@/lib/game/constants";

export const metadata: Metadata = { title: "Tonight's Stock Tokens" };

export default function SupportedAssetsPage() {
  return (
    <InfoPage
      eyebrow="PROP DEPARTMENT / SYNTHETIC INVENTORY"
      title="Tonight’s bags"
      intro="Every bell claim chooses one roster ticker. Market momentum affects only Closing Print points, never the fee, timer, or final-caller prize."
    >
      <div className="assetGrid">
        {tickerSlots.map((ticker) => (
          <article
            className="assetCard"
            key={ticker.id}
            style={{ "--faction": ticker.color } as CSSProperties}
          >
            <span className="tickerBadge">{ticker.id}</span>
            <h2>{ticker.name}</h2>
            <p>{ticker.assetName}</p>
            <dl>
              <div>
                <dt>Environment</dt>
                <dd>Local devnet</dd>
              </div>
              <div>
                <dt>Current band</dt>
                <dd>
                  {ticker.currentBand} ·{" "}
                  {(ticker.multiplierBps / 10_000).toFixed(2)}×
                </dd>
              </div>
              <div>
                <dt>Custody</dt>
                <dd>None in game contract</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <section className="disclosureBlock">
        <span className="chapterNumber">!</span>
        <div>
          <h2>What a real Stock Token is</h2>
          <p>
            Before any value-bearing launch, the app must show issuer,
            jurisdiction, eligibility, custody, redemption, transfer, oracle,
            and market-hours disclosures for every supported canonical asset.
            None of those claims are simulated here.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}
