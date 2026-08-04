# PRD 12: Robinhood Testnet Production Readiness

> `D-026` v4 override: PRD 16 replaces market-report scoring with variable
> USDG contributions, Stock Token pot baskets, volume heat, and persistent
> lifetime points. Testnet uses deterministic mock swaps.

Status: v4 package prepared; broadcast requires separate authorization.

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
- Independent services index canonical history and execute serialized round
  transitions. Devnet uses the same durable v4 lifecycle boundary.
- The indexer retains block hashes and rolls back chain-derived data across
  reorganizations. The keeper uses advisory locks, idempotency keys,
  pre-broadcast simulation, immediate transaction-hash persistence, and
  restart receipt reconciliation.
- A prepared v4 round has no timer. Its first accepted contribution starts the
  45-second clock.
- Testnet v4 uses mock Stock Tokens and deterministic swaps marked
  `TESTNET MOCK · NO VALUE`. DEX price momentum and Chainlink reports do not
  score v4.
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

The economic and accounting evidence is produced on devnet. Robinhood testnet
is reserved for the network behavior Anvil cannot prove:

1. A funded deployment from a clean pushed commit with explorer verification.
2. Two isolated wallets completing two rounds, including reusable approval,
   contribution, rollover, following-round lifetime eligibility, and basket
   withdrawal.
3. Wrong-chain, rejection, confirmation, indexing, and RPC-failover checks.

The 100-round, cancellation, fault, and endurance gates run on Anvil without
consuming testnet ETH.

## Current external blockers

- The encrypted chain-46630 roles require enough test ETH for one deployment
  and a two-round smoke test.

Mainnet remains blocked on the production canonical Stock Token swap adapter,
independent audit, current legal review, canonical asset and pool
revalidation, multisigs, and explicit release authorization.
