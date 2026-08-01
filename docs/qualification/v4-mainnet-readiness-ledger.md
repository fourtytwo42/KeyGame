# Last Bell v4 mainnet-readiness ledger

Status: devnet-requalified candidate. The historical mock-only Robinhood
testnet deployment and two-round smoke remain reconciled, but no longer match
the current runtime bytecode after the lifetime-vault rounding repair. Browser
wallet testing is intentionally skipped and compatibility remains unverified.
Mainnet is not authorized or currently qualified.

## Gate ledger

| Gate | State | Evidence or next authority |
|---|---|---|
| Accepted Anvil baseline | Passed | Commit-bound run `v4-torture-live-2026-08-01T03-57-02-588Z`: 1,000,000 state actions, 10,000 contributions, 500 settlements, 50 cancellations, 2,200 exact reconciliation rows, and all scheduled recovery faults |
| Direct production adapter | Implemented | `RobinhoodStockSwapAdapter.sol` |
| Dynamic safe roster | Implemented | market collector, v4 screener, keeper, catalog evidence |
| Mainnet-fork adapter tests | Passed locally | Five pinned pools; currently unsafe markets remain excluded at activation |
| Full release regression | Passed locally | 54 Foundry tests, 64 Vitest tests, four isolated integration tests, 20 applicable Playwright tests, mainnet protected build, live mainnet fork, and live mainnet preflight |
| Two-round Robinhood testnet smoke | Historical only / current gate blocked | Commit `2b4fcfa`, deployment block `95718412`, exactly two settlements, two players per round, all reward categories, exact eight-row allocation reconciliation, and unstarted round three. Current bytecode differs after `312dd5e`; no new testnet transaction is authorized. |
| Internal security review | Passed internally | Pinned local analyzers, manual checklist, mutation controls, fork tests, and clean torture rerun; no independent audit |
| Operator risk acknowledgement | Recorded | Unsigned acknowledgement: `No legal review or independent audit` |
| Initial role custody | Verified on testnet | One encrypted deployer EOA for all roles; independent future two-step transfers |
| External-wallet UAT | Skipped by operator | `externalWalletUatPassed=false`; browser compatibility remains `UNVERIFIED` and is not a canary gate |
| One-hour devnet launch rehearsal | Awaiting execution | Chain 31337, ten rounds, two non-admin players, 82 mock USDG, keeper/indexer restart, exact reconciliation |
| Mainnet broadcast | Compile-time locked | Separate reviewed release commit and deployment authorization |
| Mainnet launch verification | Read-only policy selected | No gameplay transaction; public promotion requires separate authorization bound to the deployment and verification report |

## Implemented release controls

- `LifetimePointsVault` caps a calculated reward to the vault's actual token
  custody and emits `LifetimeRewardRoundedToBalance`. The deterministic
  seven-round regression reproduces the prior one-unit fixed-point rounding
  shortfall and proves claims remain solvent and conserved.

- Mainnet chain and broadcast restrictions exist in both the Solidity script and
  shell wrapper. An environment variable alone cannot remove the compile-time
  lock.
- Testnet deployment requires an authorization file outside the repository,
  matching the exact pushed commit, chain 46630, one deployment, and exactly
  two settled rounds. The v4 keeper finalizes round two and refuses to prepare
  another round.
- Testnet release commands run from a clean detached worktree. Preflight
  derives the encrypted deployer-keystore address, pins the simulation and
  broadcast sender, and budgets with the higher of the RPC and Foundry gas
  prices plus 20% margin and a 0.001 ETH reserve.
- Mainnet preflight verifies chain synchronization, canonical contracts, direct
  pools, bytecode, token decimals, safety observations, and at least four safe
  catalog markets.
- Mainnet authorization binds the explicit wallet-UAT disposition, unverified
  compatibility, deployer, exact commit and manifest, one deployment, and
  read-only launch validation. Legacy canary-scoped authorization is rejected.
- The devnet rehearsal runner stores the signed transaction and hash before broadcast,
  clears the signed payload after confirmation, and reconciles receipts and
  nonces after restart.
- Mainnet read-only verification uses public clients only and checks deployed
  bytecode, roles, relationships, safe markets, the unstarted initial round,
  indexer/API agreement, and zero unexpected custody.
- Production catalog changes are deployer-controlled initially and rejected while a round is
  live.
- The production keeper delays preparation when fewer than four markets pass
  every execution gate. It never substitutes an unsafe value-bearing market.
- The indexer rebuilds deployment-derived state after a reorganization and
  materializes contributions, settlement baskets, lifetime epochs, and claims
  from canonical logs.
- Protected builds reject mock adapters, generated wallets, faucets, torture
  controls, and test attestors.
- Devnet transaction code is selected through a build-time alias and is absent
  from protected mainnet JavaScript bundles.
- PostgreSQL pool disconnects are non-fatal. The qualification controller
  resumes idempotently after transient shutdowns, and systemd-equivalent
  torture supervision relaunches exited services before accepting recovery.

## Current live market evidence

The 2026-07-31 mainnet preflight found AAPL, TSLA, SPY, and NVDA safe under the
prototype 10-minute TWAP, depth, history, and 1% execution checks. AMZN remained
in the approved catalog but was excluded from roster selection because its
simulated $1,000 buy exceeded the 1% impact limit. Market safety is revalidated
immediately before every production round; this result is evidence, not a
permanent approval.

## Candidate-change rule

Any contract or accounting change after the accepted baseline requires the
complete one-million-action torture campaign again. Service-only changes
require the affected live-devnet, restart, reorg, and reconciliation campaigns.
Any security remediation creates a new candidate. Internal review must never be
described as an independent audit or legal approval.
