# PRD 12: Robinhood Testnet Production Readiness

> `D-022` override: Chainlink credentials, feeds, and the Data Streams adapter
> are removed. Testnet signs genuine mainnet Uniswap V3 TWAP observations as
> specified in PRD 13.

Status: implementation complete; live acceptance gates blocked where noted.

This is the handoff for the production-shaped chain 46630 sprint. It does not
authorize mainnet deployment or real funds.

## Delivered architecture

- Versioned manifests distinguish Anvil 31337, Robinhood testnet 46630, and
  locked Robinhood mainnet 4663.
- Testnet roles use separate encrypted deployer, keeper, market-attestor, and
  faucet keystores outside the repository. Raw keys and passwords are not
  application environment variables.
- The deployment script refuses dirty/unpushed source, incorrect or
  unsynchronized chains, RPCs exposing unlocked accounts, unfunded signers,
  incompatible test Stock Tokens, missing confirmation, failed tests, or
  explorer verification failure.
- Native PostgreSQL stores canonical blocks, raw logs, checkpoints, rounds,
  market assets and samples, acquired reports, keeper jobs, UAT funding, and
  service heartbeats.
- Independent systemd services collect Robinhood market data, acquire Data
  Streams, index three-confirmation history, and execute serialized round
  transitions.
- The indexer retains block hashes and rolls back chain-derived data across
  reorganizations. The keeper uses advisory locks, idempotency keys,
  pre-broadcast simulation, immediate transaction-hash persistence, and
  restart receipt reconciliation.
- Dynamic selection requires 100 of 120 samples over 30 minutes, ranks total
  absolute basis-point movement, breaks ties by volume and symbol, falls back
  to an explicit FLAT volume roster, and delays if four eligible assets do not
  remain.
- A prepared round has no timer or opening price. The first entry requests
  fresh opening reports, activates the round, and its accepted $1 claim starts
  the 45-second clock.
- Chainlink V8 equity and V10 tokenized-equity reports normalize to eight price
  decimals. V10 uses `tokenizedPrice`, which includes the corporate-action
  multiplier.
- Testnet attestations bind the genuine source-report hash to chain, verifier,
  round, feed, price, and timestamps with EIP-712. Only manager-authorized
  rounds can consume them. Invalid or replayed reports revert before payment.
- A verified active round is cancelled after all four roster streams remain
  unavailable for 15 seconds.
- `/api/game/snapshot` combines live contract reads with confirmed indexed
  history. Simulator data cannot silently replace testnet or mainnet state.
- `/api/status` reports deployment provenance, RPC, database and indexer
  health, market completeness and freshness, current roster, and services.
- The `uat-testnet` wallet generates a local browser-session key and uses the
  normal Wagmi/Viem path. Build aliases physically remove its connector,
  controls, generated-key logic, and faucet implementation from protected
  bundles.

## Test evidence required for freeze

The release candidate must pass formatting, ESLint, TypeScript, Vitest,
Foundry and fuzz tests, migrations, protected-bundle scanning, both UAT and
protected builds, integration tests, and desktop/mobile browser UAT.

The following evidence must exist on Robinhood testnet before audit freeze:

1. A funded deployment from a clean pushed commit with explorer verification.
2. Genuine report acquisition using private Chainlink credentials and pinned
   equity feed IDs.
3. Two isolated browser sessions completing approval, ticker thefts, locked
   scoring, settlement, withdrawals, cancellation refund, history, and replay.
4. Wrong-chain, low-gas, stale-report, service restart, and RPC-failover tests.
5. A 24-hour soak with at least 100 rounds and exact payout, seed, and indexed
   log conservation.
6. A fresh mainnet-fork report accepted by Robinhood's official verifier proxy
   without broadcasting.

## Current external blockers

- The encrypted chain-46630 role wallets require test ETH.
- Chainlink Data Streams credentials and the final symbol/feed map are absent.
  The implementation refuses to fabricate verified-mode evidence.

Mainnet remains blocked on independent audit, current legal review, production
Chainlink access, canonical asset/feed revalidation, and explicit release
authorization.
