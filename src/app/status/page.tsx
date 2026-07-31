import type { Metadata } from "next";
import { InfoPage } from "@/components/info-page";
import { getDevnetSnapshot } from "@/lib/web3/devnet";
import { getV4DevnetSnapshot } from "@/lib/web3/v4-devnet-runtime";
import { getSystemStatus } from "@/lib/server/system-status";

export const metadata: Metadata = { title: "Signal Status" };

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const snapshot =
    process.env.NEXT_PUBLIC_GAME_MODE === "devnet"
      ? await (
          process.env.NEXT_PUBLIC_CONTRACT_VERSION === "last-bell-v4-stock-pot"
            ? getV4DevnetSnapshot()
            : getDevnetSnapshot()
        ).catch(() => null)
      : null;
  const system = await getSystemStatus().catch(() => null);
  const production =
    system && "chainId" in system
      ? (system as Awaited<ReturnType<typeof getSystemStatus>> & {
          chainId: number;
          block: number;
          sourceCommit: string;
          manifestHash: string;
          indexer: { lag: number };
          market: {
            assets: number;
            completeStreams: number;
            safeDexMarkets: number;
            quoteAgeSeconds: number | null;
            catalogVersion: string | null;
            poolSafety: Array<{
              ticker: string;
              safe: boolean;
              usdgDepth: number;
              buyImpactBps: number;
              sellImpactBps: number;
            }>;
          };
          release: {
            gates: Record<string, boolean>;
            safes: { configured: boolean };
            protectedBuildSha256: string;
            mainnetBroadcastLocked: boolean;
          };
          services: Array<{
            name: string;
            status: string;
            observedAt: string;
          }>;
        })
      : null;
  const qualification =
    system && "qualification" in system
      ? (system.qualification as {
          runId: string;
          profile: string;
          state: string;
          targetRounds: number;
          settledRounds: number;
          cancelledRounds: number;
          confirmedActions: number;
          failedActions: number;
          discrepancies: number;
          acceptedContributions: number;
          restoredFaults: number;
          resourceSamples: number;
          peakMemoryBytes: number;
          startedAt: string;
          completedAt?: string;
        } | null)
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
          <span
            className={`statusLamp ${
              qualification &&
              qualification.failedActions === 0 &&
              qualification.discrepancies === 0
                ? "good"
                : "standby"
            }`}
          />
          <div>
            <h2>
              {qualification?.profile === "v4-torture"
                ? "v4 isolated torture campaign"
                : "v4 devnet qualification"}
            </h2>
            <p>
              {qualification
                ? qualification.profile === "v4-torture"
                  ? `${qualification.settledRounds}/${qualification.targetRounds} settled · ${qualification.acceptedContributions}/10,000 contributions · ${qualification.restoredFaults} faults restored · ${qualification.discrepancies} discrepancies.`
                  : `${qualification.settledRounds} settled · ${qualification.cancelledRounds} cancelled · ${qualification.discrepancies} discrepancies.`
                : "No v4 qualification run has been recorded yet."}
            </p>
          </div>
          <strong>
            {qualification ? qualification.state.toUpperCase() : "STANDBY"}
          </strong>
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
        <article>
          <span
            className={`statusLamp ${
              production &&
              production.market.safeDexMarkets >= 4 &&
              (production.market.quoteAgeSeconds ?? Infinity) <= 30
                ? "good"
                : "standby"
            }`}
          />
          <div>
            <h2>Stock Pot market catalog</h2>
            <p>
              {production
                ? `${production.market.safeDexMarkets} safe direct pools · quote age ${production.market.quoteAgeSeconds ?? "n/a"}s · catalog ${production.market.catalogVersion?.slice(0, 10) ?? "not activated"}.`
                : "Mainnet catalog evidence is unavailable."}
            </p>
          </div>
          <strong>
            {production?.market.safeDexMarkets &&
            production.market.safeDexMarkets >= 4
              ? "READY"
              : "WAITING"}
          </strong>
        </article>
        <article>
          <span
            className={`statusLamp ${
              production?.release.safes.configured ? "good" : "standby"
            }`}
          />
          <div>
            <h2>Mainnet release gates</h2>
            <p>
              {production
                ? `${Object.values(production.release.gates).filter(Boolean).length}/${Object.keys(production.release.gates).length} recorded gates · Safes ${production.release.safes.configured ? "configured" : "pending"} · broadcast ${production.release.mainnetBroadcastLocked ? "locked" : "authorized"}.`
                : "Audit, legal, Safe, wallet, and release authorization remain required."}
            </p>
          </div>
          <strong>
            {production?.release.mainnetBroadcastLocked ? "LOCKED" : "REVIEW"}
          </strong>
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
          <p>Manifest hash: {production?.manifestHash ?? "unavailable"}</p>
          <p>
            Protected build:{" "}
            {production?.release.protectedBuildSha256 ?? "not recorded"}
          </p>
          <p>
            DEX market screen:{" "}
            {production
              ? `${production.market.safeDexMarkets} safe pools · ${production.market.completeStreams} complete 30-minute sample sets`
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
