# Saved by the Bell Implementation Gap Audit

> `D-026` update: PRD 16 is authoritative. V4 uses uncapped Stock Token pot
> contributions and persistent lifetime points. The 100-round economic gate is
> devnet-first; testnet is a separately authorized two-round smoke test.

> `D-029` update: PRD 17 is the authoritative v4 presentation. The live
> hierarchy, shared contribution composer, transaction stages, captains,
> achievements, highlights, history, earnings, leaderboards, and onchain proof
> are implemented without changing contract economics.

> Updated 2026-07-30. PRD 13 is the current DEX game specification. PRD 14 is
> the current product-retention and mainnet-readiness specification. Faction
> and Chainlink behavior is retained only in versioned replay parsers.

## Current implementation

| Capability | Status | Evidence |
|---|---|---|
| Variable Stock Pot contribution | Implemented | `LastBellRoundV4.claimBell(uint8,uint256,uint256,uint64,uint8)` |
| Rolling-volume heat and ticker points | Implemented | Contract, snapshot, and Foundry coverage |
| 50/30/10/5/5 Stock Token basket | Implemented | Round, lifetime vault, reward router, and indexer |
| First contribution starts the timer | Implemented | Prepared rounds wait with `startedAt == 0` |
| Continuous settlement and rollover | Implemented | Durable manager and keeper |
| Reward projection and live earning rate | Implemented | `RoundProjection`, player projection API, live studio |
| Truthful v4 quote and impact state | Implemented | Output bounds, point impact, projected rank, heat, approval state, and degraded-LAN pause |
| Canonical captains, achievements, and highlights | Implemented | Migration 015, canonical indexer reconstruction, reorg cleanup, player and round APIs |
| Explicit transaction stages and shared mobile composer | Implemented | One form state, wallet/approval/contribution stages, separate transaction hashes |
| Rich history, receipts, earnings, and verification | Implemented | Story summaries, share cards, reward ledger/filtering, scoped leaderboards, onchain drawer |
| SIWE caller profiles | Implemented | Nonce, verify, session, profile, history, and OG routes |
| Community featured raids | Implemented offchain | Eligibility, unique votes, countdown, live window, cooldown |
| Deployment-aware history | Implemented | Migration 005 and deployment backfill script |
| Legacy replay support | Retained | Faction, Chainlink, and DEX version parsers |
| Devnet qualification | Passed | Accelerated, endurance, browser, and torture evidence |
| Production direct-pool adapter | Internally qualified | Unit, hostile-token, and mainnet-fork coverage; no independent audit |
| Dynamic safe-market roster | Internally qualified | Catalog, safety screen, durable keeper, and evidence tables |
| Canonical v4 reward indexing | Internally qualified | Contributions, allocations, epochs, claims, and reorg rebuild |
| Schema-v4 release controls | Implemented, locked | Mainnet/testnet manifests, preflights, packaging, and authorization guards |
| Robinhood v4 testnet | Historical smoke; current bytecode mismatch | One mock-only deployment, two settled rounds, unstarted round three; current runtime changed after the lifetime-vault rounding repair |
| External-wallet UAT | Skipped | Pass remains false; browser compatibility is unverified |
| Devnet launch rehearsal | Passed | Chain 31337 only, two non-admin players, ten rounds in one real hour, 82 mock USDG, keeper/indexer restart recovery, exact reconciliation, and round eleven prepared/unstarted |
| Mainnet launch verification | Implemented, locked | Read-only bytecode, role, market, RPC, indexer, API, round-state, and custody checks; no gameplay transactions |
| Robinhood v4 mainnet | Not deployed | Compile-time locked |

## Deliberate launch gates

- Explicit display of skipped wallet UAT and unverified compatibility.
- WalletConnect is hidden unless a real Reown project and matching origin are configured.
- Accepted accelerated, two-hour stability, and one-million-action torture
  baselines remain preserved.
- Internal security evidence and Rug Zone automation disclosure.
- Single-deployer role verification with empty pending transfers.
- Canonical asset verification, incident ownership, and explicit mainnet
  release authorization.

## Acceptance boundary

The repository now contains the v5 partial-fill production adapter, dynamic
roster, durable keeper, canonical five-asset indexer, schema-v5 deployment
controls, and internal-assurance package workflow. Testnet assets remain mocks
with no value and the historical two-round smoke is complete, but it does not
qualify the current bytecode. No
mainnet deployment, independent audit, legal approval,
external-wallet compatibility, or canary success is claimed.
