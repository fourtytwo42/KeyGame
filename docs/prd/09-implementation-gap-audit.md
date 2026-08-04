# Saved by the Bell Implementation Gap Audit

> `D-030` update: PRD 16 is authoritative. V5 uses uncapped Stock Token pot
> contributions, verified partial fills, residual USDG as a fifth reward asset,
> and persistent lifetime points. Local economic qualification is devnet-first;
> testnet is a separately authorized two-round smoke test.

> `D-029` update: PRD 17 is the authoritative v5 presentation. The live
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
| Five-asset 50/30/10/5/5 basket | Implemented | Four Stock Tokens plus residual USDG across round, lifetime vault, reward router, and indexer |
| Verified partial-fill accounting | Implemented | Deposited USDG equals consumed USDG plus residual USDG; full deposits earn points |
| First contribution starts the timer | Implemented | Prepared rounds wait with `startedAt == 0` |
| Continuous settlement and rollover | Implemented | Durable manager and keeper |
| Reward projection and live earning rate | Implemented | `RoundProjection`, player projection API, live studio |
| Truthful v5 quote and result state | Implemented | Live output estimate, one-raw-unit default floor, actual consumed/residual result, point impact, rank, heat, approval state, and degraded-LAN pause |
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
| Canonical v5 reward indexing | Internally qualified | Deposited/consumed/residual contributions, five-asset allocations, epochs, claims, and reorg rebuild |
| Schema-v5 release controls | Implemented, locked | Mainnet/testnet manifests, preflights, packaging, and authorization guards |
| Robinhood v5 testnet | Not deployed | Historical v4 smoke is superseded; v5 requires new authorization for one mock-only deployment and two settled rounds |
| External-wallet UAT | Skipped | Pass remains false; browser compatibility is unverified |
| Devnet launch rehearsal | Passed | Chain 31337 only, two non-admin players, ten rounds in one real hour, 82 mock USDG, keeper/indexer restart recovery, exact reconciliation, and round eleven prepared/unstarted |
| Mainnet launch verification | Implemented, locked | Read-only bytecode, role, market, RPC, indexer, API, round-state, and custody checks; no gameplay transactions |
| Robinhood v5 mainnet | Not deployed | Compile-time locked; all prior planned packages are invalidated |

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
