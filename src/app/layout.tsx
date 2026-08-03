import type { Metadata, Viewport } from "next";
import {
  Azeret_Mono,
  Atkinson_Hyperlegible_Next,
  Big_Shoulders_Stencil,
} from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { StationShell } from "@/components/station-shell";

const bodyFont = Atkinson_Hyperlegible_Next({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Big_Shoulders_Stencil({
  variable: "--font-display",
  subsets: ["latin"],
});

const monoFont = Azeret_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ),
  title: {
    default: "Saved by the Bell · Channel 4663",
    template: "%s · Saved by the Bell",
  },
  description:
    "Pick a stock. Choose your amount. Take the bell and hold it at zero to win half the pot.",
  applicationName: "Saved by the Bell",
  keywords: [
    "onchain game",
    "Robinhood Chain",
    "Saved by the Bell",
    "ticker game",
  ],
  openGraph: {
    title: "Saved by the Bell · Channel 4663",
    description: "The last caller holding the bell wins the broadcast.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#241B32",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable}`}
    >
      <body>
        <Providers>
          <StationShell>{children}</StationShell>
        </Providers>
      </body>
    </html>
  );
}
