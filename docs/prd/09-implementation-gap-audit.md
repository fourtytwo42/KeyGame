# Last Bell Implementation Gap Audit

> Updated 2026-07-30. PRD 13 is the current DEX game specification. PRD 14 is
> the current product-retention and mainnet-readiness specification. Faction
> and Chainlink behavior is retained only in versioned replay parsers.

## Current implementation

| Capability | Status | Evidence |
|---|---|---|
| Ticker-per-claim DEX round | Implemented | `LastBellRound.claimBell(uint8,bytes,uint8)` |
| 10-minute Uniswap V3 momentum | Implemented | DEX verifier, collector, testnet attestation adapter |
| Weighted ticker result / raw-airtime contributor payout | Implemented | Contract, snapshot, replay, and Foundry coverage |
| First $1 starts the timer | Implemented | Prepared rounds wait with `startedAt == 0` |
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
- 24-hour/100-round failure-injection soak.
- Per-pool manipulation-cost evidence and Rug Zone automation analysis.
- Independent security and economic review.
- Legal and jurisdiction approval.
- Separate documented 2-of-3 manager, verifier, and treasury multisigs.
- Canonical asset verification, incident ownership, and explicit mainnet
  release authorization.

## Acceptance boundary

The repository is a production-shaped Robinhood testnet application. Testnet
assets are labeled as mocks with no value. No mainnet deployment, contract
freeze, external audit approval, legal approval, or completed 24-hour soak is
claimed by this audit.
