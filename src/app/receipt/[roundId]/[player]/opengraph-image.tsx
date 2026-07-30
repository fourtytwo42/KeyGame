import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ roundId: string; player: string }>;
}) {
  const { roundId, player } = await params;
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
        background: "#f3ff69",
        border: "28px solid #121212",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <b style={{ fontSize: 28 }}>CHANNEL 4663 · RECEIPT</b>
        <b style={{ fontSize: 28 }}>LAST BELL</b>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 118, fontWeight: 900 }}>ROUND {roundId}</span>
        <span style={{ fontSize: 44 }}>
          CALLER {player.slice(0, 10).toUpperCase()}
        </span>
      </div>
      <b style={{ fontSize: 34 }}>
        RAW AIRTIME PAYS · MOMENTUM WEARS THE CROWN
      </b>
    </div>,
    size,
  );
}
