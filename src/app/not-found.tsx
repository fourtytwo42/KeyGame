import Link from "next/link";

export default function NotFound() {
  return (
    <div className="stateInterstitial deadAir" style={{ minHeight: "70vh" }}>
      <span className="eyebrow">CHANNEL NOT FOUND</span>
      <h1>Wrong frequency</h1>
      <p>This tape does not exist, or somebody labeled it after midnight.</p>
      <Link className="primaryAction linkAction" href="/">
        RETURN TO CHANNEL 4663
      </Link>
    </div>
  );
}
