# PRD 15: Audit Candidate, Airtime Pool, and Mainnet Readiness

Status: `IMPLEMENTED CANDIDATE / TESTNET REDEPLOY AND SOAK REQUIRED`

This PRD supersedes every current-version payout statement in PRDs 01-14.
Historical faction, Chainlink, and winning-ticker payout rules remain available
only to versioned replay adapters.

## Product rule

> Pick a stock. Pay $1 to take the bell. Hold it at zero to win 50%. Every raw
> second earns a share of the 30% Airtime Pool. Momentum wins the Closing Print
> Crown, not money.

The four allocations remain exactly:

- 50% to the final holder.
- 30% to all callers by total raw control time across every ticker.
- 15% to the next-round seed.
- 5% to protocol.

The contract version is `closing-print-v3-airtime`. The accepted claim ABI
remains `claimBell(uint8,bytes,uint8)`. Reward withdrawal is
`claimAirtimeReward()`.

## Crown and Airtime separation

The Closing Print Crown is a nonfinancial identity. Weighted ticker points,
locked bands, multipliers, rank, receipts, profiles, raids, and replays remain.
DEX movement cannot alter holder, Airtime, seed, protocol, refund, or claimable
totals. Unsafe DEX markets are excluded for Crown integrity. Fewer than four
safe markets produces a clearly labeled FLAT Crown. The Crown is not a price
oracle or financial prediction.

The Airtime Pool is financial:

```text
player share = player total raw control seconds / round total raw control seconds
player reward = Airtime Pool * player share
```

All callers with positive raw control time qualify. The final Airtime claimant
receives any integer-rounding remainder after 100% of raw control time has been
claimed. This makes the pool exactly conserved.

## Rug Zone disclosure

Rug Zone is intentionally first come, first served. Before and during it the
interface states:

- `RUG ZONE IS FCFS`
- `AUTOMATED WALLETS MAY BE FASTER`
- `LAST ACCEPTED CALL WINS 50%`

Automation advantage is monitored and disclosed, not treated as a freeze
failure by itself. There is no commit/reveal, randomness, cooldown, dynamic fee,
throttle, pot cap, or spend cap.

## Public model and interfaces

`RoundProjection` exposes `closingPrintCrown`, `airtimePoolUsd`,
`totalRawAirtimeSeconds`, the holder projection, and live earning rate.
`PlayerRoundProjection` exposes per-ticker raw seconds and weighted points,
`playerRawAirtimeSeconds`, `projectedAirtimeShareBps`,
`projectedAirtimeRewardUsd`, and holder/total projected rewards.

`/api/game/snapshot`, `/api/players/{address}/round-projection`, history,
replay, receipts, profiles, and Open Graph output use v3 terms. Deprecated
Closing Print payout fields exist only inside old-version adapters.

`RoundSettled` includes the Crown ticker/score, gross pot, all four pools, total
raw control time, and contract version. `AirtimeRewardClaimed` includes Crown
identity, eligible and claimed raw seconds, amount, total Airtime Pool, and
contract version.

## Operations and privileged roles

Operations receive nonblocking warning and critical pot alerts. Alerts never
reject a call, change a payout, or alter a live round.

Mainnet requires three separate audited 2-of-3 Safes for manager admin,
verifier admin, and treasury. All three use the same three independently
controlled owners. Keeper and attestor remain narrow encrypted operational
keys. If audited Safe deployments cannot be verified on Robinhood Chain,
release remains blocked.

Incident and rotation procedures are in
`docs/operations/privileged-roles-and-incidents.md`.

## Wallet acceptance

The protected application retains MetaMask, Rabby, Coinbase Wallet, Safe,
WalletConnect QR, and injected EIP-6963 support through the common Wagmi path.
Manual testnet evidence is required for wrong chain, rejection, insufficient
gas, approval rejection/reuse, accepted/rejected calls, settlement, both reward
withdrawals, and 390x844 plus 1280x720 paid flows.

The built-in wallet, generated key, faucet, mock-asset controls, test attestor,
and soak fault controls must be absent from protected bundles.

## Soak evidence

The PostgreSQL-backed controller stores run configuration, distributed actions,
transaction hashes, faults, health, assertions, and canonical reconciliation.
The minimum run is 24 hours and 100 completed Robinhood testnet rounds.

Two encrypted, narrowly funded player keystores live outside the repository.
Transaction hashes are persisted immediately after broadcast and reconciled on
restart. New spending stops below the configured gas reserve while monitoring
and reconciliation continue.

The authenticated, server-only, testnet-only schedule covers LAN RPC fallback,
stale DEX observations, unsafe roster replacement, keeper/indexer/web restarts,
stale and replayed attestations, cancellation/refund/rollover/reward paths, and
isolated reorg and duplicate-round fixtures.

## Audit freeze gates

Freeze requires:

1. At least 100 completed rounds over at least 24 hours.
2. No stuck or duplicate round.
3. Exact canonical reconciliation for fees, refunds, holder rewards, Airtime
   rewards, seed, and protocol.
4. No charge for invalid or unavailable market data.
5. Fuzz proof that arbitrary bands and multipliers cannot change money for an
   identical control-time sequence.
6. Local Foundry, app, integration, migration, browser, accessibility,
   protected-build, fork, and wallet tests.
7. Recovery from every scheduled fault without manual database edits.

Mainnet remains blocked on audit remediation, legal and eligibility approval,
canonical mapping verification, verified Safes and supplied owners, production
Reown configuration, incident ownership, and explicit broadcast authorization.
