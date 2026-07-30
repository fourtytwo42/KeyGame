import { ImageResponse } from "next/og";
import { getProfile } from "@/lib/server/profiles";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ identity: string }>;
}) {
  const { identity } = await params;
  const profile = await getProfile(identity).catch(() => null);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        color: "#121212",
        background: "#d9c8ff",
        border: "28px solid #121212",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <b style={{ fontSize: 28 }}>CHANNEL 4663 · CALLER TAPE</b>
        <b style={{ fontSize: 28 }}>LAST BELL</b>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 88, fontWeight: 900 }}>
          {profile?.displayName ?? "UNKNOWN CALLER"}
        </span>
        <span style={{ fontSize: 42 }}>@{profile?.handle ?? identity}</span>
      </div>
      <div style={{ display: "flex", gap: 70, fontSize: 34 }}>
        <b>{profile?.stats.calls ?? 0} CALLS</b>
        <b>{profile?.stats.finalBells ?? 0} FINAL BELLS</b>
        <b>{profile?.stats.topTicker ?? "NO BAG"} TOP TICKER</b>
      </div>
    </div>,
    size,
  );
}
