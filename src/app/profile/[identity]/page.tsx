import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/server/profiles";
import { formatUsd, shortAddress } from "@/lib/game/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ identity: string }>;
}): Promise<Metadata> {
  const { identity } = await params;
  const profile = await getProfile(identity).catch(() => null);
  return {
    title: profile ? `${profile.displayName} · Last Bell` : "Caller not found",
    description: profile
      ? `${profile.stats.calls} calls and ${profile.stats.finalBells} final bells on Last Bell.`
      : "Last Bell caller profile.",
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ identity: string }>;
}) {
  const { identity } = await params;
  const profile = await getProfile(identity).catch(() => null);
  if (!profile) notFound();
  const stats = profile.stats;
  return (
    <article className="infoPage profilePage">
      <header className="pageTitleBar">
        <span className="eyebrow">CALLER TAPE / PUBLIC PROFILE</span>
        <h1>{profile.displayName}</h1>
        <span className="finalStamp">@{profile.handle}</span>
      </header>
      <section className="profileHero">
        <span
          className="profileAvatar profileAvatarLarge"
          style={
            {
              "--avatar-seed": `#${profile.avatarSeed.slice(0, 6)}`,
            } as React.CSSProperties
          }
          aria-hidden="true"
        />
        <div>
          <span>{shortAddress(profile.address)}</span>
          <strong>{profile.favoriteTicker ?? "NO FAVORITE BAG"}</strong>
          <p>Stats below come from confirmed calls on the active deployment.</p>
        </div>
      </section>
      <dl className="profileStats">
        <div>
          <dt>CALLS</dt>
          <dd>{stats.calls}</dd>
        </div>
        <div>
          <dt>ROUNDS</dt>
          <dd>{stats.roundsPlayed}</dd>
        </div>
        <div>
          <dt>FINAL BELLS</dt>
          <dd>{stats.finalBells}</dd>
        </div>
        <div>
          <dt>CROWN TICKER CALLS</dt>
          <dd>{stats.closingPrintCrownContributions}</dd>
        </div>
        <div>
          <dt>RAW AIRTIME</dt>
          <dd>{stats.totalRawAirtimeSeconds}s</dd>
        </div>
        <div>
          <dt>TOP TICKER</dt>
          <dd>{stats.topTicker ?? "—"}</dd>
        </div>
        <div>
          <dt>CLAIMED</dt>
          <dd>{formatUsd(stats.claimedRewardsUsd)}</dd>
        </div>
      </dl>
      <div className="pageEndActions">
        <Link className="primaryAction" href="/">
          RETURN TO THE BELL
        </Link>
      </div>
    </article>
  );
}
