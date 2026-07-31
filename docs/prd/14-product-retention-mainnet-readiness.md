# PRD 14: Product, Retention, and Mainnet Readiness

Status: `IMPLEMENTED IN STAGES / MAINNET GATED`

> `D-024` override: PRD 15 replaces the paid Closing Print outcome with a
> nonfinancial Crown and distributes the 30% Airtime Pool across every caller
> by total raw control time.

This document is the canonical specification for reward clarity, caller
identity, featured raids, deployment-aware history, and the remaining audit
candidate gates. It extends PRD 13 without changing round economics.

## Retention decisions

| ID | Requirement | Status |
|---|---|---|
| `RET-001` | Show `IF THE BELL RANG NOW` with the projected 50% holder result and 30% Closing Print result. | Implemented |
| `RET-002` | Include the current uncredited holder interval and label every projection as an estimate. | Implemented |
| `RET-003` | Show the locked ticker, band, multiplier, and points per second while the bell is live. | Implemented |
| `RET-004` | Show entry DEX bands as `EST.` and prevent stale observations from enabling a paid call. | Implemented |
| `RET-005` | Keep weighted points and raw payout airtime visually and semantically separate. | Implemented |
| `RET-006` | Use `CONNECT WALLET` before connection and the shortened address after connection. | Implemented |
| `RET-007` | Financial, status, action, and interactive labels have an 11px minimum. | Implemented |
| `RET-008` | Do not add a max-spend field, soft reminder, or local hard cap. | Retained |

## Projection interfaces

- `GET /api/game/snapshot` includes `RoundProjection`.
- `GET /api/players/{address}/round-projection` returns chain-derived
  per-ticker raw airtime, weighted points, pending holder time, and projected
  rewards.
- Projections never replace the contract's settled pull-payment balances.

## Caller profiles

| ID | Requirement | Status |
|---|---|---|
| `IDENT-001` | SIWE-style EIP-4361 message with a one-time five-minute nonce. | Implemented |
| `IDENT-002` | 24-hour HTTP-only, SameSite Strict session bound to wallet, chain, domain, and origin. | Implemented |
| `IDENT-003` | Opt-in ASCII handle, display name, favorite ticker, and deterministic avatar. | Implemented |
| `IDENT-004` | Reserved, impersonating, profane, confusable, replayed, and rate-limited inputs fail closed. | Implemented |
| `IDENT-005` | Calls, rounds, final bells, winning contributions, airtime, top ticker, and claimed rewards are derived from confirmed chain events. | Implemented |
| `IDENT-006` | Live callers and archived final callers link to public profiles with address fallback. | Implemented |
| `IDENT-007` | Profile and receipt routes expose shareable Open Graph images without referral rewards. | Implemented |

Public endpoints:

- `POST /api/auth/nonce`
- `POST /api/auth/verify`
- `GET` and `DELETE /api/auth/session`
- `GET /api/profiles/{handleOrAddress}`
- `PUT /api/profile`
- `GET /api/profiles/{handleOrAddress}/history`

## Featured raids

Raids are an offchain attention layer. They never change the contract timer,
roster, fee, score, payout, transaction, or automatic rollover.

- A voter must be signed in and have one accepted call with three
  confirmations on the active deployment in the previous 30 days.
- Voting is one wallet, one vote, with no token or balance weighting.
- The adaptive threshold is 20% of eligible callers, clamped to 3–25 and never
  above the eligible population. Devnet and testnet use deterministic 1 and 2
  caller UAT overrides unless explicitly configured.
- Threshold starts a five-minute countdown, followed by 15 minutes live and a
  45-minute cooldown.
- Gathering expires after 24 hours. Votes never carry into a new campaign.
- PostgreSQL advisory locks and a campaign/address primary key serialize
  deciding votes.
- Eligibility is rechecked against canonical three-confirmation events before
  the raid becomes live. A dropped vote returns countdown to gathering.
- A live raid finishes even if a later reorg is detected; the discrepancy is
  operational evidence, not an economic state change.

Endpoints:

- `GET /api/raids/current`
- `POST /api/raids/vote`

## Deployment identity and history

`deployment_key = chain_id:lower(manager_address):deployment_block`.

- Deployments use this key as their primary identity.
- Rounds are unique by `(deployment_key, round_id)`.
- Chain events, indexer checkpoints, keeper idempotency, raid eligibility, and
  histories are scoped to it.
- Contract addresses remain globally unique in the index.
- `pnpm db:backfill-deployments` registers current and archived manifests,
  reassigns retained events by deployment block range, and reconstructs round
  identities from canonical manager events.
- Replay IDs include deployment, round, contract, and settlement transaction
  material.
- Faction, Chainlink, and DEX event decoders remain available for historical
  tape playback.

## Audit-candidate gates

The following are release gates, not claims of completed external approval:

> Wallet-UAT note: D-027 supersedes this release gate for the initial mainnet
> candidate. The following matrix remains future backlog; it is not passed.

1. Configure a real Reown project ID and production origin allowlist.
2. Manually UAT MetaMask, Rabby, Coinbase, Safe, WalletConnect QR, wrong-chain,
   rejection, allowance reuse, and reward withdrawal.
3. For every eligible DEX pool, demonstrate manipulation cost at least 10 times
   the maximum affected Closing Print payout, or exclude/cap it after economic
   review.
4. Measure automated-wallet and latency advantage in Rug Zone and obtain
   explicit product acceptance before contract freeze.
5. Transfer manager admin, verifier admin, and treasury to documented,
   separate 2-of-3 multisigs; keep keeper and attestor narrowly authorized.
6. Pass the local 24-hour/100-round soak with injected RPC, stale-attestation,
   reorg, service-restart, liquidity, and duplicate-round failures.
7. Obtain independent security audit, economic review, legal approval,
   canonical asset verification, incident ownership, and explicit release
   authorization.

All builds, tests, migrations, and soak work run locally on the KeyGame VM.
GitHub Actions remains disabled.
