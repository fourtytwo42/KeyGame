# PRD 16: Stock Pot and Lifetime Points

Status: `AUTHORITATIVE V4 / MAINNET-READINESS IMPLEMENTATION`

Contract version: `last-bell-v4-stock-pot`

## Acceptance record

Implemented and functionally accepted on Anvil on 2026-07-30. The local gate includes the
v4 contracts, sequential manager, Stock Token basket settlement, lifetime
vault, reward router, deterministic mock swap adapter, APIs, earnings center,
leaderboards, deployment-keyed database migration, event indexer, desktop and
mobile browser UAT, accessibility, and protected-build scanning.

The extended economic qualification runs on Anvil: 100 accelerated settled
rounds, ten cancellation rounds, exact per-token and per-point reconciliation,
fault injection, and a two-hour unattended stability pass. The non-broadcast Robinhood testnet handoff is
`artifacts/last-bell-v4-testnet-ready.tgz`. Testnet remains a mock-asset
environment. The operator authorized one mock-only testnet deployment and
exactly two settled network-compatibility rounds after requalification.
The historical mock-only two-round testnet smoke completed and reconciled, but
its deployed runtime predates the lifetime-vault rounding repair in `312dd5e`.
It is preserved as historical network evidence and does not qualify the current
bytecode without a separately authorized replacement smoke. Current internal
devnet assurance is complete.
External-wallet UAT is intentionally skipped, remains unpassed, and browser
compatibility is labeled unverified. Fresh production market checks and an
explicit mainnet authorization remain separate gates.

The production-readiness implementation adds a non-upgradeable,
Robinhood-mainnet-only direct Uniswap V3 adapter, a deployer-controlled catalog
capped at 16 assets, dynamic four-market screening, deployment-keyed roster
evidence, a durable v4 keeper, canonical reward indexing, schema-v4 manifests,
and fail-closed testnet/mainnet release scripts. This is implementation
evidence, not deployment or approval.

Initially, one encrypted deployer EOA holds manager admin, market admin,
keeper, treasury, conversion, and testnet faucet authority. Manager admin,
market admin, and treasury support independent two-step migration; keeper is
independently rotatable. Treasury acceptance affects only later-prepared rounds.
The operator acknowledgement is recorded as `No legal review or independent
audit`; it is not signed and is not represented as either form of approval.

Lifetime reward calculations are capped to the vault's actual custody at
claim time. When fixed-point accumulator rounding calculates one unit more than
the vault holds, the vault pays its complete balance and emits
`LifetimeRewardRoundedToBalance` with both amounts. Claims remain solvent,
points remain non-consuming, and the event preserves exact audit evidence.

The final launch rehearsal uses two deterministic non-admin wallets on an
isolated chain-31337 deployment for ten rounds over one real hour. It spends 82
mock USDG under a 100 mock-USDG runner ceiling. Mainnet receives read-only
deployment verification only; no scripted gameplay precedes separately
authorized public promotion.

This document supersedes current-economy requirements in PRDs 10–15. Legacy
contracts and parsers remain available for old receipts and replays.

## Player rule

> Pick a stock. Choose an amount. Take the bell. Recent buys heat the stock for
> followers. Hold the bell at zero to win half the Stock Token basket.

The minimum contribution is 1 USDG. There is no contract or interface maximum.
Every accepted call atomically swaps USDG into the selected roster Stock Token,
accounts the received quantity, awards points, and changes the holder. Any
failed allowance, quote, deadline, minimum-output, execution-safety, or swap
check reverts the complete call.

## Score and heat

Each ticker has six five-second volume buckets. The rolling 30-second volume is
read before the new contribution is added:

`multiplier = 1 + sqrt(min(recent volume, 4,000 USDG) / 4,000 USDG)`

The multiplier is capped at 2× and points are
`floor(USDG input × locked multiplier)`. The incoming buy heats the ticker for
following callers. Highest total points wins. Ties use the most recent accepted
ticker contribution, then the lower roster index.

## Token-basket settlement

Every accounted Stock Token balance is split independently:

- 50% Last Bell: final accepted caller.
- 30% Winning Stock: contributors to the highest-point stock, proportional to
  their multiplied points in that stock.
- 10% Lifetime Points: holders of points active before this settlement.
- 5% next-round seed.
- 5% protocol, including integer dust.

Rewards are token baskets, not USDG. Direct unsolicited transfers are excluded
from accounting. Cancellation returns each player’s actual purchased token
outputs and discards the cancelled round’s pending points.

## Lifetime points

One `LifetimePointsVault` belongs to the v4 manager and survives sequential
rounds. Settled points never burn and never expire. Round N points are pending
through Round N and become active for Round N+1. Cancellation discards pending
points. If active supply is zero, the 10% basket carries until an eligible
settlement. Per-token reward-per-point accumulators keep claims bounded; the
catalog is capped at 16 tokens.

## Interface requirements

The action surface includes `$1`, `$10`, `$100`, `$1,000`, and uncapped custom
amounts. Before signing, it shows USDG input, estimated stock received, locked
multiplier, projected points, minimum output, quote expiry, and projected
standings. The game board shows 30-second volume, multiplier, ticker points,
player points, points to lead, token quantity in the pot, and estimated USD
value.

The earnings center separates Last Bell, Winning Stock, Lifetime Points, and
refunds. It shows claimable, claimed, total earned, active/pending points,
eligible supply, share percentage, per-ticker points, and the exact
numerator/denominator calculation for every ledger item.

Leaderboards cover round, season, and lifetime points, settled contributions,
largest calls, ticker captains, flips, Final Bells, and claimed rewards.
Leaderboard status never changes financial rewards.

## Safety and release gates

Slippage and quote expiry protect execution but are not spending caps.
Production swaps accept only manifest-whitelisted canonical assets, verified
router/pool bytecode, and at most 1% deviation from a ten-minute TWAP. Devnet
and testnet use clearly labeled mock assets and a deterministic adapter.

An eligible production roster market must also be active and non-halted, use
canonical USDG and a direct pinned-factory pool, expose at least 30 minutes of
oracle history, have nonzero liquidity and at least 10,000 USDG depth, keep a
simulated 1,000 USDG buy and sell below 1% impact, provide at least 100 of 120
expected samples, and have fresh corporate-action metadata. The roster ranks
safe markets by recent trading activity, daily volume, then symbol. Fewer than
four safe markets delays preparation; value-bearing v4 never substitutes an
unsafe fallback.

V4 must pass Foundry unit/fuzz tests, 100 accelerated settled Anvil rounds, ten
cancellation rounds, a two-hour stability run, changed-roster seed
conversion, exact basket and point reconciliation, indexer reconstruction,
service restarts, desktop/mobile browser UAT, accessibility, protected-bundle
scanning, and local production builds. Testnet scripts and manifests may be
prepared, but broadcast requires separate authorization and is limited to two
smoke-test rounds. Mainnet remains blocked on audit,
economic review, legal approval, canonical asset verification, and explicit
release authorization.

The exact mainnet release sequence, external gates, stop conditions, testnet
smoke procedure, and canary rules are maintained in
`docs/operations/v4-mainnet-release-runbook.md`. Mainnet remains compile-time
locked and an environment variable alone cannot authorize it.
