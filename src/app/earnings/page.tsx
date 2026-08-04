import type { Metadata } from "next";
import { EarningsCenter } from "@/components/earnings-center";
import { InfoPage } from "@/components/info-page";

export const metadata: Metadata = { title: "Rewards" };

export default function EarningsPage() {
  return (
    <InfoPage
      eyebrow="YOUR LOCKER / STOCK BASKETS"
      title="Rewards"
      intro="See what is claimable, what you already claimed, and the exact lifetime-points share behind it."
    >
      <EarningsCenter />
    </InfoPage>
  );
}
