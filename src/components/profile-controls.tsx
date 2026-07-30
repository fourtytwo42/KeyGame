"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSignMessage } from "wagmi";
import type { PlayerProfile } from "@/lib/game/types";

export function ProfileControls({
  address,
  chainId,
}: {
  address: `0x${string}`;
  chainId: number;
}) {
  const { signMessageAsync } = useSignMessage();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(
    `caller_${address.slice(2, 8).toLowerCase()}`,
  );
  const [displayName, setDisplayName] = useState("New caller");
  const [favoriteTicker, setFavoriteTicker] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [sessionResponse, profileResponse] = await Promise.all([
      fetch("/api/auth/session", { cache: "no-store" }),
      fetch(`/api/profiles/${address}`, { cache: "no-store" }),
    ]);
    const sessionPayload = (await sessionResponse.json()) as {
      session?: { address: string } | null;
    };
    setAuthenticated(
      sessionPayload.session?.address.toLowerCase() === address.toLowerCase(),
    );
    if (profileResponse.ok) {
      const payload = (await profileResponse.json()) as {
        profile: PlayerProfile;
      };
      setProfile(payload.profile);
      setHandle(payload.profile.handle);
      setDisplayName(payload.profile.displayName);
      setFavoriteTicker(payload.profile.favoriteTicker ?? "");
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
    // A wallet change recreates the form and reloads its server state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const signIn = async () => {
    setBusy(true);
    setMessage("");
    try {
      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, chainId }),
      });
      const nonce = (await nonceResponse.json()) as {
        message?: string;
        error?: string;
      };
      if (!nonceResponse.ok || !nonce.message) {
        throw new Error(nonce.error || "Could not prepare sign-in.");
      }
      const signature = await signMessageAsync({ message: nonce.message });
      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: nonce.message, signature }),
      });
      const verified = (await verifyResponse.json()) as { error?: string };
      if (!verifyResponse.ok) {
        throw new Error(verified.error || "Signature verification failed.");
      }
      setAuthenticated(true);
      setEditing(!profile);
      setMessage("Signed in. No token approval was created.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, displayName, favoriteTicker }),
      });
      const payload = (await response.json()) as {
        profile?: PlayerProfile;
        error?: string;
      };
      if (!response.ok || !payload.profile) {
        throw new Error(payload.error || "Profile update failed.");
      }
      setProfile(payload.profile);
      setEditing(false);
      setMessage("Caller profile is live.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="profileControls" aria-label="Caller profile">
      <span className="eyebrow">CALLER PROFILE / OPTIONAL</span>
      {profile && !editing ? (
        <div className="profileSummary">
          <span
            className="profileAvatar"
            style={
              {
                "--avatar-seed": `#${profile.avatarSeed.slice(0, 6)}`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
          <span>
            <strong>{profile.displayName}</strong>
            <Link href={`/profile/${profile.handle}`}>@{profile.handle} →</Link>
          </span>
          <button
            type="button"
            className="textButton"
            disabled={busy}
            onClick={() => (authenticated ? setEditing(true) : void signIn())}
          >
            {authenticated
              ? "EDIT"
              : busy
                ? "CHECKING SIGNATUREâ€¦"
                : "SIGN IN"}
          </button>
        </div>
      ) : authenticated && editing ? (
        <div className="profileForm">
          <label>
            HANDLE
            <input
              value={handle}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
            />
          </label>
          <label>
            DISPLAY NAME
            <input
              value={displayName}
              maxLength={24}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label>
            FAVORITE TICKER
            <input
              value={favoriteTicker}
              maxLength={8}
              onChange={(event) =>
                setFavoriteTicker(event.target.value.toUpperCase())
              }
            />
          </label>
          <button
            type="button"
            className="secondaryAction fullWidth"
            disabled={busy}
            onClick={() => void save()}
          >
            SAVE CALLER PROFILE
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="secondaryAction fullWidth"
          disabled={busy}
          onClick={() => void signIn()}
        >
          {busy ? "CHECKING SIGNATURE…" : "SIGN IN · NO GAS"}
        </button>
      )}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
