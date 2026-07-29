import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { factions } from "@/lib/game/constants";

export const metadata: Metadata = { title: "Supported Bags" };

export default function SupportedAssetsPage() {
  return (
    <InfoPage
      eyebrow="PROP DEPARTMENT / SYNTHETIC INVENTORY"
      title="Tonight’s bags"
      intro="Ticker factions make teams legible. They are not price bets, charts, brokerage positions, or promises of stock ownership."
    >
      <div className="assetGrid">
        {factions.map((faction) => (
          <article
            className="assetCard"
            key={faction.id}
            style={{ "--faction": faction.color } as CSSProperties}
          >
            <span className="tickerBadge">{faction.id}</span>
            <h2>{faction.name}</h2>
            <p>{faction.assetName}</p>
            <dl>
              <div>
                <dt>Environment</dt>
                <dd>Local devnet</dd>
              </div>
              <div>
                <dt>Value</dt>
                <dd>None</dd>
              </div>
              <div>
                <dt>Custody</dt>
                <dd>Test contract only</dd>
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
