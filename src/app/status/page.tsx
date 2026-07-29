import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { getDevnetSnapshot, roundAddress } from "@/lib/web3/devnet";

export const metadata: Metadata = { title: "Signal Status" };

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const snapshot =
    process.env.NEXT_PUBLIC_GAME_MODE === "devnet"
      ? await getDevnetSnapshot().catch(() => null)
      : null;
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
          <span className={`statusLamp ${snapshot ? "good" : "standby"}`} />
          <div>
            <h2>Canonical game tape</h2>
            <p>
              {snapshot
                ? `Chain ${snapshot.chainId} · block ${snapshot.blockNumber} · ${snapshot.phase}.`
                : "Canonical RPC is unavailable; game actions are disabled."}
            </p>
          </div>
          <strong>{snapshot ? "ONLINE" : "OFFLINE"}</strong>
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
        <span className="chapterNumber">ID</span>
        <div>
          <h2>Build and contract identity</h2>
          <p>Application version: 0.1.0</p>
          <p>Round contract: {roundAddress}</p>
          <p>Latest verified block: {snapshot?.blockNumber ?? "unavailable"}</p>
        </div>
      </section>
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
