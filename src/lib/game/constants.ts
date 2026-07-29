import type { Faction, RoundConfig } from "./types";

export const factions: Faction[] = [
  {
    id: "NVDA",
    name: "The Green Room",
    assetName: "Synthetic NVDA Stock Token",
    color: "#55C6A9",
    secondary: "#183D36",
    memberCount: 184,
  },
  {
    id: "AAPL",
    name: "The Orchard",
    assetName: "Synthetic AAPL Stock Token",
    color: "#B5A6D8",
    secondary: "#3A3157",
    memberCount: 149,
  },
  {
    id: "TSLA",
    name: "The Hot Seat",
    assetName: "Synthetic TSLA Stock Token",
    color: "#F15D4C",
    secondary: "#5B211B",
    memberCount: 212,
  },
  {
    id: "SPY",
    name: "The Wide Shot",
    assetName: "Synthetic SPY Stock Token",
    color: "#5261A8",
    secondary: "#242B5D",
    memberCount: 231,
  },
];

export const roundConfig: RoundConfig = {
  roundId: "4663",
  entryPriceUsd: 1,
  claimPriceUsd: 1,
  startSeconds: 45,
  extensionSeconds: 2,
  rugZoneSeconds: 10,
  hardCapSeconds: 180,
  payoutBps: {
    holder: 5000,
    faction: 3000,
    rewards: 1500,
    protocol: 500,
  },
  factions,
};

export const demoAddresses = {
  caller: "0x4663B31100000000000000000000000000000001",
  rival: "0x4663B31100000000000000000000000000000002",
  player: "0x4663B31100000000000000000000000000000003",
} as const;

export const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);

export const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
