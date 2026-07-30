import type { NextConfig } from "next";

const uatWalletModule =
  process.env.NEXT_PUBLIC_UAT_WALLET_ENABLED === "true"
    ? "./src/lib/web3/uat-connector.enabled.ts"
    : "./src/lib/web3/uat-connector.disabled.ts";
const uatControlsModule =
  process.env.NEXT_PUBLIC_UAT_WALLET_ENABLED === "true"
    ? "./src/components/uat-controls.enabled.tsx"
    : "./src/components/uat-controls.disabled.tsx";
const uatFundingModule =
  process.env.KEYGAME_UAT_ENABLED === "true"
    ? "./src/lib/server/uat-funding.enabled.ts"
    : "./src/lib/server/uat-funding.disabled.ts";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    resolveAlias: {
      "@/lib/web3/uat-connector-runtime": uatWalletModule,
      "@/components/uat-controls-runtime": uatControlsModule,
      "@/lib/server/uat-funding-runtime": uatFundingModule,
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
