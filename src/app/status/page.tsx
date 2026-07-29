import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Signal Status" };

export default function StatusPage() {
  return (
    <InfoPage
      eyebrow="ENGINEERING / TRANSMITTER ROOM"
      title="Signal status"
      intro="This build defaults to deterministic local devnet. Testnet readiness does not imply a production launch."
    >
      <div className="statusGrid">
        <article>
          <span className="statusLamp good" />
          <div>
            <h2>Web broadcast</h2>
            <p>Next.js application serving current Channel 4663 assets.</p>
          </div>
          <strong>ONLINE</strong>
        </article>
        <article>
          <span className="statusLamp good" />
          <div>
            <h2>Local game tape</h2>
            <p>Deterministic simulator available without RPC or wallet.</p>
          </div>
          <strong>ONLINE</strong>
        </article>
        <article>
          <span className="statusLamp standby" />
          <div>
            <h2>Robinhood testnet</h2>
            <p>Chain 46630 configured. Deployment requires a funded key.</p>
          </div>
          <strong>STANDBY</strong>
        </article>
        <article>
          <span className="statusLamp standby" />
          <div>
            <h2>WalletConnect</h2>
            <p>Requires an allowlisted Reown project ID per environment.</p>
          </div>
          <strong>CONFIG</strong>
        </article>
      </div>
      <section className="disclosureBlock">
        <span className="chapterNumber">i</span>
        <div>
          <h2>Honest failure behavior</h2>
          <p>
            If canonical state is delayed or unavailable, Last Bell disables the
            action and shows Dead Air. A submitted claim is never presented as
            the holder until it is accepted.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}
