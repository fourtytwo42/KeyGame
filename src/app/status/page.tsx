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
          process.env.NEXT_PUBLIC_CONTRACT_VERSION ===
            "saved-bell-v5-market-pot" ||
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
          block: number | null;
          sourceCommit: string;
          manifestHash: string;
          indexer: { lag: number | null };
          rpc: {
            policy: "LAN_ONLY";
            activeProvider: "lan";
            connectionStatus: "healthy" | "degraded";
            headLag: number | null;
            automaticFailover: false;
          };
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
            gates: Record<string, boolean | string>;
            contractSize: {
              passed: boolean;
              reportSha256: string | null;
              managerRuntimeBytes: number | null;
              managerEip170MarginBytes: number | null;
              policyVersion: string | null;
            };
            walletUat: {
              status: "PASSED" | "SKIPPED_BY_OPERATOR" | "NOT_PERFORMED";
              passed: boolean;
              browserWalletCompatibility: "VERIFIED" | "UNVERIFIED";
              requiredForCanary: boolean;
              evidenceSha256: string | null;
              dispositionRecordedAt: string | null;
            };
            assurance: {
              label: string;
              internalSecurityReviewSha256: string | null;
              operatorRiskAcknowledgement: string | null;
              operatorRiskAcknowledgedAt: string | null;
              unresolvedCriticalOrHighFindings: number;
              externalWalletUatEvidenceSha256: string | null;
            };
            roleCustody: {
              mode: string;
              manager: string | null;
              pendingManager: string | null;
              market: string | null;
              pendingMarket: string | null;
              keeper: string | null;
              treasury: string | null;
              pendingTreasury: string | null;
              conversionOperator: string | null;
              configured: boolean;
            };
            protectedBuildSha256: string;
            plannedManifestSha256: string | null;
            finalManifestSha256: string | null;
            authorizationState: string;
            readOnlyVerification: {
              status: string;
              reportSha256: string | null;
            };
            promotionState: string;
            unlisted: boolean;
            mainnetBroadcastLocked: boolean;
          };
          services: Array<{
            name: string;
            status: string;
            observedAt: string;
          }>;
          rehearsal: {
            id: string;
            state: string;
            chainId: number;
            settledRounds: number;
            targetRounds: number;
            durationMinutes: number;
            spentUsdg: number;
            budgetUsdg: number;
            startedAt: string;
            endsAt: string;
            reportSha256: string | null;
            lastError: string | null;
          } | null;
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
            <p>
              Next.js application serving the current Saved by the Bell
              interface.
            </p>
          </div>
          <strong>ONLINE</strong>
        </article>
        <article>
          <span
            className={`statusLamp ${
              production?.release.contractSize.passed ? "good" : "standby"
            }`}
          />
          <div>
            <h2>Contract size</h2>
            <p>
              {production?.release.contractSize.managerRuntimeBytes !== null &&
              production?.release.contractSize.managerRuntimeBytes !== undefined
                ? `Manager ${production.release.contractSize.managerRuntimeBytes.toLocaleString("en-US")} bytes · ${production.release.contractSize.managerEip170MarginBytes?.toLocaleString("en-US") ?? "unknown"} bytes below EIP-170 · ${production.release.contractSize.policyVersion ?? "policy unavailable"}.`
                : "Release-profile contract-size evidence is unavailable."}
            </p>
          </div>
          <strong>
            {production?.release.contractSize.passed
              ? "CONTRACT SIZE PASSED"
              : "WAITING"}
          </strong>
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
          <span
            className={`statusLamp ${
              production?.rpc.connectionStatus === "healthy"
                ? "good"
                : "standby"
            }`}
          />
          <div>
            <h2>
              {production?.chainId === 4663
                ? "Robinhood mainnet"
                : "Robinhood testnet"}
            </h2>
            <p>
              {production
                ? `Chain ${production.chainId} · block ${production.block ?? "unavailable"} · indexer lag ${production.indexer.lag ?? "unknown"} · LAN-only RPC · reference lag ${production.rpc.headLag ?? "unknown"}.`
                : "Chain 46630 configured. Deployment requires a funded key."}
            </p>
          </div>
          <strong>
            {production
              ? production.rpc.connectionStatus === "healthy"
                ? "ONLINE"
                : "CONNECTION DEGRADED"
              : "STANDBY"}
          </strong>
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
              production?.release.roleCustody.configured ? "good" : "standby"
            }`}
          />
          <div>
            <h2>Mainnet release gates</h2>
            <p>
              {production
                ? `${Object.values(production.release.gates).filter((value) => value === true).length} passing gates · wallet UAT ${production.release.walletUat.status.toLowerCase().replaceAll("_", " ")} · role custody ${production.release.roleCustody.configured ? "verified" : "pending"} · broadcast ${production.release.mainnetBroadcastLocked ? "locked" : "authorized"}.`
                : "Internal assurance, role-custody verification, and release authorization remain required."}
            </p>
          </div>
          <strong>
            {production?.release.mainnetBroadcastLocked ? "LOCKED" : "REVIEW"}
          </strong>
        </article>
        <article>
          <span
            className={`statusLamp ${
              production?.rehearsal?.state === "completed" ? "good" : "standby"
            }`}
          />
          <div>
            <h2>Devnet launch rehearsal</h2>
            <p>
              {production?.rehearsal
                ? `Chain ${production.rehearsal.chainId} · ${production.rehearsal.settledRounds}/${production.rehearsal.targetRounds} settled · ${production.rehearsal.durationMinutes} minute window · $${production.rehearsal.spentUsdg.toFixed(2)}/$${production.rehearsal.budgetUsdg.toFixed(2)} mock budget · ${production.rehearsal.state} · report ${production.rehearsal.reportSha256?.slice(0, 10) ?? "pending"}.`
                : "The one-hour chain-31337 launch rehearsal has not completed."}
            </p>
          </div>
          <strong>
            {production?.rehearsal?.state.toUpperCase() ?? "WAITING"}
          </strong>
        </article>
        <article>
          <span className="statusLamp standby" />
          <div>
            <h2>Mainnet launch validation</h2>
            <p>
              {production?.chainId === 4663
                ? `MAINNET / ${production.release.unlisted ? "UNLISTED" : "PROMOTED"} / read-only ${production.release.readOnlyVerification.status.toLowerCase()} / promotion ${production.release.promotionState.toLowerCase()}.`
                : "Read-only verification only. Mainnet gameplay is not pretested; public promotion requires separate approval."}
            </p>
          </div>
          <strong>READ ONLY</strong>
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
            <h2>Browser wallets</h2>
            <p>
              {production
                ? `External wallet UAT ${production.release.walletUat.status.toLowerCase().replaceAll("_", " ")} · compatibility ${production.release.walletUat.browserWalletCompatibility.toLowerCase()}.`
                : "External wallet compatibility has not been verified."}
            </p>
          </div>
          <strong>
            {production?.release.walletUat.browserWalletCompatibility ??
              "UNVERIFIED"}
          </strong>
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
            Planned manifest:{" "}
            {production?.release.plannedManifestSha256 ?? "pending"}
            {" / "}Final manifest:{" "}
            {production?.release.finalManifestSha256 ?? "pending"}
          </p>
          <p>
            Launch authorization:{" "}
            {production?.release.authorizationState ?? "not authorized"}
            {" / "}Read-only verification{" "}
            {production?.release.readOnlyVerification.status ?? "not deployed"}
            {" / "}Promotion {production?.release.promotionState ?? "locked"}
          </p>
          <p>
            Protected build:{" "}
            {production?.release.protectedBuildSha256 ?? "not recorded"}
          </p>
          <p>
            Contract size:{" "}
            {production?.release.contractSize.passed ? "passed" : "pending"}
            {" · manager "}
            {production?.release.contractSize.managerRuntimeBytes ?? "unknown"}
            {" bytes · EIP-170 margin "}
            {production?.release.contractSize.managerEip170MarginBytes ??
              "unknown"}
            {" bytes · report "}
            {production?.release.contractSize.reportSha256 ?? "not recorded"}
          </p>
          <p>
            Assurance: {production?.release.assurance.label ?? "not recorded"}
          </p>
          <p>
            Internal review:{" "}
            {production?.release.assurance.internalSecurityReviewSha256 ??
              "pending"}
            {" · "}unresolved critical/high{" "}
            {production?.release.assurance.unresolvedCriticalOrHighFindings ??
              "n/a"}
          </p>
          <p>NO LEGAL REVIEW · NO INDEPENDENT AUDIT</p>
          <p>
            Operator acknowledgement:{" "}
            {production?.release.assurance.operatorRiskAcknowledgement ??
              "not recorded"}
            {production?.release.assurance.operatorRiskAcknowledgedAt
              ? ` · ${production.release.assurance.operatorRiskAcknowledgedAt}`
              : ""}
          </p>
          <p>
            Role custody:{" "}
            {production?.release.roleCustody.mode === "single-deployer-eoa"
              ? "SINGLE DEPLOYER EOA"
              : (production?.release.roleCustody.mode ?? "unavailable")}
          </p>
          <p>
            Manager {production?.release.roleCustody.manager ?? "unavailable"}
            {" · "}Market{" "}
            {production?.release.roleCustody.market ?? "unavailable"}
            {" · "}Keeper{" "}
            {production?.release.roleCustody.keeper ?? "unavailable"}
            {" · "}Treasury{" "}
            {production?.release.roleCustody.treasury ?? "unavailable"}
            {" · "}Conversion{" "}
            {production?.release.roleCustody.conversionOperator ??
              "unavailable"}
          </p>
          <p>
            Pending transfers: manager{" "}
            {production?.release.roleCustody.pendingManager ?? "none"}
            {" · "}market{" "}
            {production?.release.roleCustody.pendingMarket ?? "none"}
            {" · "}treasury{" "}
            {production?.release.roleCustody.pendingTreasury ?? "none"}
          </p>
          <p>
            Testnet smoke:{" "}
            {production?.release.gates.testnetCurrentBytecodeMatches
              ? "passed · current bytecode matches"
              : production?.release.gates.testnetHistoricalSmokePassed
                ? "historical only · current bytecode mismatch"
                : "pending"}
            {" · "}External wallet UAT{" "}
            {production?.release.walletUat.status ?? "not performed"}
            {" · "}Browser compatibility{" "}
            {production?.release.walletUat.browserWalletCompatibility ??
              "UNVERIFIED"}
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
            If canonical state is delayed or unavailable, Saved by the Bell
            disables the action and shows Dead Air. A submitted claim is never
            presented as the holder until it is accepted.
          </p>
        </div>
      </section>
    </InfoPage>
  );
}
