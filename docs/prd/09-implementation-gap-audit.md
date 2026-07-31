# Last Bell Implementation Gap Audit

> `D-026` update: PRD 16 is authoritative. V4 uses uncapped Stock Token pot
> contributions and persistent lifetime points. The 100-round economic gate is
> devnet-first; testnet is a separately authorized two-round smoke test.

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
| Truthful DEX/FLAT entry state | Implemented | Estimated bands, stale-data pause, FLAT-only 1.00x |
| SIWE caller profiles | Implemented | Nonce, verify, session, profile, history, and OG routes |
| Community featured raids | Implemented offchain | Eligibility, unique votes, countdown, live window, cooldown |
| Deployment-aware history | Implemented | Migration 005 and deployment backfill script |
| Legacy replay support | Retained | Faction, Chainlink, and DEX version parsers |
| Devnet qualification | Passed | Accelerated, endurance, browser, and torture evidence |
| Production direct-pool adapter | Implemented, pre-audit | Unit, hostile-token, and mainnet-fork coverage |
| Dynamic safe-market roster | Implemented, pre-audit | Catalog, safety screen, durable keeper, and evidence tables |
| Canonical v4 reward indexing | Implemented, pre-audit | Contributions, allocations, epochs, claims, and reorg rebuild |
| Schema-v4 release controls | Implemented, locked | Mainnet/testnet manifests, preflights, packaging, and authorization guards |
| Robinhood v4 testnet | Not deployed | Separate authorization required for two-round mock smoke |
| Robinhood v4 mainnet | Not deployed | Compile-time locked |

## Deliberate launch gates

- A real Reown project ID and allowlisted production origins.
- Manual extension-wallet and WalletConnect UAT.
- Accepted accelerated, two-hour stability, and one-million-action torture
  baselines remain preserved.
- Production swap-adapter audit and Rug Zone automation disclosure.
- Independent security and economic review.
- Legal and jurisdiction approval.
- Separate documented 2-of-3 manager, market/catalog, and treasury Safes.
- Canonical asset verification, incident ownership, and explicit mainnet
  release authorization.

## Acceptance boundary

The repository now contains the production adapter, dynamic roster, durable v4
keeper, canonical v4 indexer, schema-v4 deployment controls, and audit-package
workflow. Testnet assets remain mocks with no value. No v4 testnet or mainnet
deployment, contract freeze, independent audit approval, Safe verification,
external-wallet UAT, legal approval, or canary success is claimed.
