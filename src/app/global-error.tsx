"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          className="stateInterstitial deadAir"
          style={{ minHeight: "100vh" }}
        >
          <span className="eyebrow">MASTER CONTROL ERROR</span>
          <h1>Dead air</h1>
          <p>The broadcast failed safely. No wallet action was submitted.</p>
          <button className="primaryAction" type="button" onClick={reset}>
            RETUNE THE SIGNAL
          </button>
        </main>
      </body>
    </html>
  );
}
