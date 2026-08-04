# Saved by the Bell v5 mainnet-readiness ledger

Status: v5 contract and accounting implementation is in progress. The v4
testnet smoke, internal review, torture run, and planned mainnet deployment are
superseded evidence because v5 runtime bytecode differs. Browser-wallet testing
remains skipped and compatibility unverified. No v5 broadcast is authorized.

## Gate ledger

| Gate | State | Evidence or next authority |
|---|---|---|
| Accepted Anvil baseline | In progress | Corrected v5 snapshot passed 1,000,000 state actions. Clean run `v4-torture-live-2026-08-04T02-55-40-152Z` must still finish 10,000 contributions, 500 settlements, 50 cancellations, and 2,750 five-asset reconciliation rows. |
| Direct production adapter | Implemented | `RobinhoodStockSwapAdapter.sol` |
| Dynamic safe roster | Implemented | market collector, v4 screener, keeper, catalog evidence |
| Mainnet-fork adapter tests | Passed locally for v5 | Live LAN-only tests exercised the production adapter without broadcasting; currently unsafe markets remain excluded at activation. |
| Full release regression | In progress | 70 Foundry tests, 117 Vitest tests, lint, TypeScript, production/protected builds, contract sizes, static analysis, secret scan, and live LAN mainnet fork pass. Clean v5 live campaign and browser UAT remain. |
| Two-round Robinhood testnet smoke | Superseded | Historical v4 smoke passed, but its bytecode and four-asset accounting cannot qualify `saved-bell-v5-market-pot`. A new authorization is required after v5 local qualification. |
| Internal security review | Passed internally for current v5 bytecode | Pinned local analyzers, manual checklist, mutation controls, fork tests, and one-million-action campaign; no unresolved critical/high finding and no independent audit. |
| Operator risk acknowledgement | Recorded | Unsigned acknowledgement: `No legal review or independent audit` |
| Initial role custody | Verified on testnet | One encrypted deployer EOA for all roles; independent future two-step transfers |
| External-wallet UAT | Skipped by operator | `externalWalletUatPassed=false`; browser compatibility remains `UNVERIFIED` and is not a canary gate |
| One-hour devnet launch rehearsal | Passed | Deployment key `31337:0x610178da211fef7d417bc0e6fed39f05609ad788:8`: ten settlements at minutes 0-54, two non-admin callers per round, 82 mock USDG, keeper restart after round four, indexer restart after round seven, exact reconciliation, and round eleven prepared/unstarted. Report SHA-256 `0da42b0f63bcedeb38e93eea2da2ca64c9753a8c9607743fcc4770606ce12ef2`. |
| Mainnet broadcast | Invalidated and locked | Regenerate only after v5 testnet reconciliation; the v4 nonce-bound plan cannot authorize v5. |
| Mainnet launch verification | Read-only policy selected | No gameplay transaction; public promotion requires separate authorization bound to the deployment and verification report |

## Implemented release controls

- Runtime RPC policy is `LAN_ONLY`. The configured Alchemy endpoint is
  `HEALTH_CHECK_ONLY`; it can be probed for block height/canonical agreement
  but never receives automatic application traffic or signed transactions.
  LAN outage or head lag marks connection degraded and pauses browser
  broadcasts.

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
  compatibility, deployer, exact commit and nonce-bound planned manifest, one
  deployment run, unused state, and read-only launch validation. Legacy or
  consumed authorizations are rejected.
- Mainnet planning simulates the complete deployment on a pinned LAN-backed
  fork and records the deployer nonce, predicted CREATE addresses, runtime
  hashes, exact transaction count, gas used, constructors, and initial roster.
- The production keeper is promotion-gated. On chain 4663 it refuses to load
  signing access unless the deployment manifest, zero-transaction read-only
  report, and separate promotion authorization all match.
- The devnet rehearsal runner stores the signed transaction and hash before broadcast,
  clears the signed payload after confirmation, and reconciles receipts and
  nonces after restart.
- Mainnet read-only verification uses public clients only and checks deployed
  bytecode, roles, relationships, safe markets, the unstarted initial round,
  indexer/API agreement, zero unexpected custody, and an explicit
  `LAN_ONLY`/`HEALTH_CHECK_ONLY`/no-automatic-failover manifest and live status.
- Final release packaging is fail-closed until a replacement testnet manifest,
  current-bytecode comparison, exact two-round reconciliation, all three reward
  categories, two players per round, and one unstarted successor validate
  against the same frozen commit.
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

The 2026-08-03 LAN mainnet research found highly uneven public pool liquidity:
NVDA was deepest, SPY and AAPL remained usable at the measured sizes, TSLA was
thin for larger calls, and AMZN crossed a severe concentrated-liquidity cliff.
V5 intentionally treats that repricing as market behavior and retains unspent
USDG as a reward asset when a swap reaches its available range. Depth, impact,
and TWAP deviation are monitored and disclosed but do not block contributions
after activation;
canonical identity, active status, history, and nonzero active liquidity remain
required.

## Candidate-change rule

Any contract or accounting change after the accepted baseline requires the
complete one-million-action torture campaign again. Service-only changes
require the affected live-devnet, restart, reorg, and reconciliation campaigns.
Any security remediation creates a new candidate. Internal review must never be
described as an independent audit or legal approval.
