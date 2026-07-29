# Last Bell Implementation Gap Audit

Status: reconciled against the PRD suite on 2026-07-28.

This audit distinguishes missing implementation from intentionally gated work. Prototype behavior is not production approval.

## Implemented in this reconciliation

| Area | Result | Evidence |
|---|---|---|
| Faction entry | Players choose one of four factions before acting; the contract permanently locks the round choice. | `LastBellRound.joinFaction`, Entry Desk |
| Bounded session | Players choose a $5, $10, or $25 maximum. ERC-20 allowance and `maxSpend` enforce the ceiling; the UI shows spent, remaining, and available calls. | Contract, Round Session panel |
| Revocation | A player can set the round allowance to zero and prevent further calls. | Wallet hook, devnet action API |
| Wallet writes | Connected wallets can fund with devnet USDG, approve a bounded amount, enter, call, revoke, and claim holder, faction, or refund balances. | `use-wallet-game.ts` |
| Honest transaction state | Submitted, accepted, and rejected actions remain distinct; the holder changes only after canonical confirmation. | Live Game |
| Settlement claims | Final-holder and airtime-faction pull payments are exposed after settlement. | Final Transmission |
| Cancellation recovery | Cancelled rounds declare no winner and expose accepted-fee refunds while separating network gas. | Cancelled Round |
| Pool semantics | The 15% allocation is a next-round seed, not a participation reward. | `nextRoundPool`, Rules |
| Canonical replay | Replay uses ordered `BellClaimed` logs with transaction and block identity. | Devnet projection, Replay |
| Verifiable receipts | Receipts use deployed round state and display chain, block, and contract identity. | Receipt route |
| Rules and status identity | Rules publish constants and deployed identities; Status publishes chain, phase, latest block, contract, and build version. | Rules and Status |
| Configuration validation | Public mode, URLs, and addresses fail with literal configuration errors. | `env.ts` tests |

## Already present and retained

- Responsive Channel 4663 shell and all planned public routes.
- Deterministic simulator scenarios for entry, live, Rug Zone, finalizing, settlement, and Dead Air.
- Local Anvil deployment, Foundry tests, integration tests, Playwright browser coverage, accessibility checks, and CI.
- Injected/EIP-6963, MetaMask, Coinbase Wallet, Safe, and optional WalletConnect connector configuration.
- Robinhood Chain testnet configuration and deployment scripts.
- Faucet-issued devnet units and synthetic ticker factions.

## Intentionally gated, not missing

- Custody, deposit, withdrawal, pricing, corporate-action handling, or rewards involving real Robinhood Stock Tokens.
- Player-funded prizes, production USDG, or claims that synthetic ticker factions are investments.
- Robinhood Chain mainnet, production economics, legal eligibility, sanctions/geofencing, brokerage claims, or launch approval.
- Account abstraction, gas sponsorship, paymasters, relayers, and delegated session keys. The current wallet path uses explicit transactions.
- Production indexers, RPC failover, observability vendors, support tooling, and incident paging.
- Native game tokens, ICOs, affiliate trees, random airdrops, perpetual emissions, or monetary referrals.

## External launch prerequisites

1. Product counsel and compliance approval for jurisdictions, copy, Stock Token eligibility, and prize structure.
2. Final RPC, funded deployer, explorer credentials, WalletConnect project ID, and environment ownership.
3. Independent contract security review and economic simulation before player-funded deployment.
4. Named owners for pause/cancel authority, treasury, next-round seeding, incident response, support, and key management.
5. A production analytics/privacy decision and launch thresholds for comprehension, retention, failures, and responsible-play signals.

## Acceptance boundary

The implemented Stage 1 target is a local-devnet game and Robinhood Chain testnet-ready prototype using synthetic ticker factions and play USDG. It does not approve real Stock Token custody, real-value prizes, or production launch.
