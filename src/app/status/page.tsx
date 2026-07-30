import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { getDevnetSnapshot } from "@/lib/web3/devnet";
import { getSystemStatus } from "@/lib/server/system-status";

export const metadata: Metadata = { title: "Signal Status" };

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const snapshot =
    process.env.NEXT_PUBLIC_GAME_MODE === "devnet"
      ? await getDevnetSnapshot().catch(() => null)
      : null;
  const system = await getSystemStatus().catch(() => null);
  const production =
    system && "chainId" in system
      ? (system as Awaited<ReturnType<typeof getSystemStatus>> & {
          chainId: number;
          block: number;
          sourceCommit: string;
          indexer: { lag: number };
          market: { assets: number; completeStreams: number };
          services: Array<{
            name: string;
            status: string;
            observedAt: string;
          }>;
        })
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
          <span className={`statusLamp ${production ? "good" : "standby"}`} />
          <div>
            <h2>Robinhood testnet</h2>
            <p>
              {production
                ? `Chain ${production.chainId} · block ${production.block} · indexer lag ${production.indexer.lag}.`
                : "Chain 46630 configured. Deployment requires a funded key."}
            </p>
          </div>
          <strong>{production ? "ONLINE" : "STANDBY"}</strong>
        </article>
        {production?.services.map((service) => (
          <article key={service.name}>
            <span
              className={`statusLamp ${
                service.status === "ok" ? "good" : "standby"
              }`}
            />
            <div>
              <h2>{service.name}</h2>
              <p>
                Last heartbeat{" "}
                {new Date(service.observedAt).toLocaleString("en-US")}.
              </p>
            </div>
            <strong>{service.status.toUpperCase()}</strong>
          </article>
        ))}
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
          <p>Round contract: {snapshot?.contractAddress ?? "unavailable"}</p>
          <p>Latest verified block: {snapshot?.blockNumber ?? "unavailable"}</p>
          <p>Deployment commit: {production?.sourceCommit ?? "unavailable"}</p>
          <p>
            Market screen:{" "}
            {production
              ? `${production.market.assets} assets · ${production.market.completeStreams} complete streams`
              : "unavailable"}
          </p>
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
