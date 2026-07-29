import { parseAbi } from "viem";

export const lastBellAbi = parseAbi([
  "function currentPhase() view returns (uint8)",
  "function deadline() view returns (uint64)",
  "function hardEnd() view returns (uint64)",
  "function pot() view returns (uint256)",
  "function holder() view returns (address)",
  "function holderFaction() view returns (uint8)",
  "function acceptedClaims() view returns (uint256)",
  "function factionAirtime(uint8) view returns (uint256)",
  "function claimBell()",
  "function finalize()",
  "event BellClaimed(uint256 indexed roundId, uint256 indexed sequence, address indexed player, uint8 faction, uint64 acceptedAt, uint64 deadline, uint256 pot)",
]);
