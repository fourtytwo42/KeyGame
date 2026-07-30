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
| Devnet and Robinhood testnet | Implemented | VM-local application and service builds |

## Deliberate launch gates

- A real Reown project ID and allowlisted production origins.
- Manual extension-wallet and WalletConnect UAT.
- 100-round accelerated devnet qualification plus eight-hour stability pass.
- Production swap-adapter audit and Rug Zone automation disclosure.
- Independent security and economic review.
- Legal and jurisdiction approval.
- Separate documented 2-of-3 manager, verifier, and treasury multisigs.
- Canonical asset verification, incident ownership, and explicit mainnet
  release authorization.

## Acceptance boundary

The repository is a production-shaped v4 devnet application with a guarded
testnet package. Testnet assets are labeled as mocks with no value. No testnet
or mainnet deployment, contract freeze, external audit approval, or legal
approval is claimed by this audit.
