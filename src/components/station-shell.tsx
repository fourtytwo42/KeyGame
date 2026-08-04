import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { WalletPanel } from "./wallet-panel";
import { EarningsNavLink } from "./earnings-nav-link";
import { OnAirStatus } from "./on-air-status";

export function StationShell({ children }: { children: ReactNode }) {
  const mode = process.env.NEXT_PUBLIC_GAME_MODE || "simulator";
  return (
    <div className="stationFrame">
      <a className="skipLink" href="#main-content">
        Skip to broadcast
      </a>
      <header className="stationHeader">
        <Link
          className="stationIdentity"
          href="/"
          aria-label="Saved by the Bell home"
        >
          <Image
            src="/brand/saved-bell-mascot.png"
            alt=""
            width={62}
            height={62}
            priority
          />
          <strong className="stationTitle">
            <span className="stationTitleWord">SAVED</span>
            <span className="stationTitleBridge">BY THE</span>
            <span className="stationTitleWord">BELL</span>
          </strong>
        </Link>
        <OnAirStatus />
        <nav className="desktopNav" aria-label="Primary">
          <Link href="/rules">Rules</Link>
          <Link href="/supported-assets">Bags</Link>
          <EarningsNavLink />
          <Link href="/leaderboards">Whales</Link>
        </nav>
        <WalletPanel />
      </header>
      <main id="main-content">{children}</main>
      <footer className="stationFooter">
        <p>
          Saved by the Bell is experimental software.{" "}
          {mode === "mainnet"
            ? "Stock Token markets are identified onchain."
            : `${mode === "testnet" ? "Testnet" : "Devnet"} tokens have no monetary value. Stock Token references are synthetic unless explicitly marked otherwise.`}
        </p>
        <nav aria-label="Footer">
          <Link href="/rules">Rules</Link>
          <Link href="/supported-assets">Supported assets</Link>
          <Link href="/earnings">Earnings</Link>
        </nav>
      </footer>
    </div>
  );
}
