# PRD 16: Stock Pot and Lifetime Points

Status: `AUTHORITATIVE V5 / IMPLEMENTATION IN PROGRESS`

Contract version: `saved-bell-v5-market-pot`

V5 changes contract and accounting bytecode. All v4 devnet, testnet, internal
assurance, and planned-mainnet artifacts are historical evidence only and do
not qualify v5. No v5 testnet or mainnet broadcast is authorized.

Presentation requirements are extended by PRD 17. PRD 17 changes no v5
contract, accounting, timer, contribution, approval, or RPC behavior.

## Acceptance record

The v5 contracts, sequential manager/factory, five-asset settlement, lifetime
vault, reward router, deterministic partial-fill mock adapter, APIs, indexer,
and product presentation are implemented. Focused Foundry and application
tests pass. The clean v5 torture, live-devnet, browser, and replacement testnet
qualification records remain required before this status becomes accepted.

The prior v4 extended qualification and testnet smoke remain historical
evidence only. V5 requires a new one-million-action model run, 10,000 live
devnet contributions, 500 settlements, 50 cancellations, exact five-asset
reconciliation, browser UAT, and a newly authorized mock-only two-round
testnet smoke. The future package name is
`saved-bell-v5-testnet-ready-<commit>.tgz`.
External-wallet UAT is intentionally skipped, remains unpassed, and browser
compatibility is labeled unverified. Fresh production market checks and an
explicit mainnet authorization remain separate gates.

All deployment-capable paths use the pinned Foundry `release` profile: Solidity
0.8.30, optimizer enabled at 200 runs, and IR compilation. A selected-contract
size gate excludes local Foundry script contracts, enforces the 24,576-byte
EIP-170 limit and a stricter 23,000-byte production budget, and binds the
compiler configuration, runtime sizes, and runtime hashes into release
evidence. V5 moves round creation into `RoundFactoryV5`; the manager is 9,427
bytes and the factory is 16,843 bytes under this profile. Devnet uses
standard Anvil contract-size enforcement so build-profile drift fails before
testnet or mainnet packaging.

The mainnet release candidate uses a nonce-bound planned deployment generated
from a pinned LAN-backed fork simulation. Authorization binds the exact source,
plan hash, deployer, predicted addresses, runtime hashes, transaction count,
constructor configuration, and read-only launch policy. Deployment consumes
the authorization before broadcasting. Keeper signing remains disabled until
a separately authorized public promotion matches the immutable deployment and
zero-transaction read-only verification report.

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

The historical v4 launch rehearsal remains useful service evidence, but it does
not qualify v5 accounting. V5 must complete its own clean isolated devnet
campaign, five-asset reconciliation, and desktop/mobile acceptance before a
replacement testnet smoke can be authorized. Mainnet receives read-only
deployment verification only; no scripted gameplay precedes separately
authorized public promotion.

This document supersedes current-economy requirements in PRDs 10–15. Legacy
contracts and parsers remain available for old receipts and replays.

## Player rule

> Pick a stock. Choose an amount. Take the bell. Recent buys heat the stock for
> followers. Hold the bell at zero to win half the Stock Token basket.

The minimum contribution is 1 USDG. There is no contract or interface maximum.
The first accepted contribution starts a five-minute countdown. Later accepted
calls add two seconds outside the final ten-second Rug Zone, and the round has a
ten-minute hard stop.
Every accepted call deposits its complete USDG amount and attempts a direct
swap into the selected Stock Token. The adapter reports and proves both USDG
consumed and Stock Token received. A positive partial fill is accepted: the
complete deposit awards points and takes the bell, while unspent USDG remains
accounted in the round. A zero-output fill, failed allowance, expired deadline,
caller minimum-output failure, dishonest balance report, or failed callback
reverts the complete call.

## Score and heat

Each ticker has six five-second volume buckets. The rolling 30-second volume is
read before the new contribution is added:

`multiplier = 1 + sqrt(min(recent volume, 4,000 USDG) / 4,000 USDG)`

The multiplier is capped at 2× and points are
`floor(USDG input × locked multiplier)`. The incoming buy heats the ticker for
following callers. Highest total points wins. Ties use the most recent accepted
ticker contribution, then the lower roster index.

## Token-basket settlement

Every accounted Stock Token balance and the residual USDG balance are split
independently:

- 50% Saved by the Bell: final accepted caller.
- 30% Winning Stock: contributors to the highest-point stock, proportional to
  their multiplied points in that stock.
- 10% Lifetime Points: holders of points active before this settlement.
- 5% next-round seed.
- 5% protocol, including integer dust.

Rewards are five-asset baskets: four Stock Tokens plus residual USDG. Direct
unsolicited transfers are excluded
from accounting. Cancellation returns each player’s actual purchased token
outputs and discards the cancelled round’s pending points.

Cancellation also returns each player's exact residual USDG. Canonical event
reconstruction must prove `deposited USDG = consumed USDG + residual USDG` for
every accepted contribution.

## Lifetime points

One `LifetimePointsVault` belongs to the v4 manager and survives sequential
rounds. Settled points never burn and never expire. Round N points are pending
through Round N and become active for Round N+1. Cancellation discards pending
points. If active supply is zero, the 10% basket carries until an eligible
settlement. Per-token reward-per-point accumulators keep claims bounded; the
catalog is capped at 16 tokens.

## Interface requirements

The action surface includes `$1`, `$10`, `$100`, `$1,000`, and uncapped custom
amounts. Before signing, it shows USDG input, live-Quoter estimated stock
received, locked multiplier, projected points, and projected standings. After
acceptance it shows USDG deposited, USDG consumed, residual USDG, actual Stock
Token output, and points earned. The app submits a one-raw-unit minimum output;
the ABI still permits stricter caller-selected protection. The game board shows
30-second volume, multiplier, ticker points,
player points, points to lead, token quantity in the pot, and estimated USD
value.

The earnings center separates Saved by the Bell, Winning Stock, Lifetime Points, and
refunds. It shows claimable, claimed, total earned, active/pending points,
eligible supply, share percentage, per-ticker points, and the exact
numerator/denominator calculation for every ledger item.

Leaderboards cover round, season, and lifetime points, settled contributions,
largest calls, ticker captains, flips, Final Bells, and claimed rewards.
Leaderboard status never changes financial rewards.

## Safety and release gates

Robinhood RPC operation is LAN-only. Alchemy is retained only as an
observational health reference for block height and canonical agreement. A LAN
outage or lag greater than five blocks displays `CONNECTION DEGRADED` and
pauses frontend actions and browser broadcast; it never triggers automatic
failover. Switching active
providers requires an explicit operator instruction.

Quote expiry and exact balance-delta accounting protect transaction integrity
but are not spending caps. Production swaps accept only manifest-whitelisted
canonical assets and verified direct pool bytecode. Pool price movement,
execution impact, and declining inventory are intentional market behavior and
do not impose a protocol-level slippage ceiling. The default application call
sets minimum output to one raw Stock Token unit and accepts any positive Stock
Token output; wallets and direct callers retain the
ABI-level ability to specify a stricter minimum output. Devnet and testnet use
clearly labeled mock assets and a deterministic adapter.

At activation, an eligible production roster market must also be active and non-halted, use
canonical USDG and a direct pinned-factory pool, expose at least 30 minutes of
oracle history, have nonzero active liquidity, hold at least 10,000 USDG depth,
provide at least 100 of 120
expected samples, and have fresh corporate-action metadata. Depth, two-sided
impact, and spot/TWAP deviation remain visible monitoring evidence. After
activation, falling depth or price movement never disables that live round;
only inability to return positive output prevents a contribution. The roster
ranks eligible markets by
recent trading activity, daily volume, then symbol. Fewer than four technically
valid markets delays preparation.

V5 must pass fresh Foundry unit/fuzz tests, a new million-action and
10,000-transaction torture campaign,
changed-roster seed conversion, exact basket and point reconciliation, indexer
reconstruction, service restarts, accessibility, protected-bundle scanning,
and local production builds. Testnet broadcast requires separate authorization
and is limited to one mock-only deployment and exactly two smoke-test rounds.
The final package must prove that deployment matches the frozen bytecode, both
rounds have two players and five asset allocations, every reward category was
claimed, and round three is unstarted. Mainnet remains blocked on current
canonical-market qualification, funding, the dedicated compile-lock commit,
explicit deployment authorization, read-only verification, and separate
promotion authorization. External-wallet UAT, independent audit, and legal
review are intentionally waived and must remain disclosed as unperformed.

The exact mainnet release sequence, external gates, stop conditions, testnet
smoke procedure, and canary rules are maintained in
`docs/operations/v4-mainnet-release-runbook.md`. Mainnet remains compile-time
locked and an environment variable alone cannot authorize it.
