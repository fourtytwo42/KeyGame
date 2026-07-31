# Project Memory

Durable project context lives here. Update this file whenever information should survive chat context compression or future agent handoff.

## Active Handoff

- Current task: `last-bell-v4-stock-pot` is implemented and accepted on Anvil.
  Do not broadcast v4 to Robinhood testnet or mainnet without a separate user
  authorization.
- Last meaningful result: v4 contract, application, API, devnet rollover,
  lifetime rewards, changed-roster seed rebalance, browser UAT, protected build,
  and testnet package gates passed on the project VM. The clean live devnet is
  round 4663 in entry state with the automatic keeper running. Last verified
  2026-07-30.
- Testnet-ready archive:
  `artifacts/last-bell-v4-testnet-ready.tgz`; its adjacent `.sha256` file is the
  package checksum. It is explicitly marked not broadcast and records both the
  baseline commit and working-tree diff hash.
- The shortened v4 endurance run
  `v4-devnet-2026-07-30T21-33-20-690Z` completed 24 naturally timed rounds and
  all scheduled recovery faults. Final reconciliation found zero basket, point,
  assertion, action, or unresolved-transaction discrepancies. Evidence is in
  `artifacts/qualification/` as matching JSON and Markdown reports. Source
  commit `b303635` passed the accelerated gate; endurance hardening through
  `f65bea5` safely classifies the preserved no-charge revert as recovered.
- The isolated v4 torture campaign is accepted. Run
  `v4-torture-live-2026-07-31T03-44-39-339Z` completed exactly 1,000,000
  deterministic Foundry state actions, 10,000 accepted live contributions,
  500 settlements, 50 cancellations, 13,825 confirmed transaction hashes, and
  all ten recovery faults. Reconciliation found zero basket, point, assertion,
  action, or unresolved-revert discrepancies. The campaign source is
  `1c4926e`; reporting and fully isolated browser/integration routing were
  hardened afterward.
- Checksummed evidence is
  `artifacts/torture/v4-torture-live-2026-07-31T03-44-39-339Z.json` and `.md`;
  deterministic shard logs and seeds are in the same-name subdirectory.
  Preserved failed attempts document the keeper idempotency, cancellation
  predicate, and PostgreSQL recovery defects that were fixed before acceptance.
- Do not broadcast to Robinhood testnet or mainnet.

## Current State

- `docs/prd/16-stock-pot-lifetime-points.md` is authoritative. V4 replaces the
  fixed fee and Airtime economy with uncapped variable USDG contributions that
  atomically buy the selected mock Stock Token for the round basket.
- V4 payout is 50% final holder, 30% winning-stock contributors by multiplied
  points in that stock, 10% persistent lifetime-point holders, 5% next seed,
  and 5% protocol. Points are USDG input times a pre-call rolling-volume
  multiplier; DEX price movement no longer scores the game.
- `LifetimePointsVault` promotes settled points for the following round,
  discards cancelled points, never burns points on claim, and accrues a bounded
  multi-token reward catalog. `RewardRouterV4` batches round and lifetime
  claims.
- The v4 UI has an uncapped amount composer, $1/$10/$100/$1,000 presets,
  winning-stock heat and points, earnings center, and round/season/lifetime
  leaderboards. Desktop 1280x720 and mobile 390x844 keep the paid action visible.
- The v4 indexer decodes manager, round, and lifetime-vault events and
  materializes Stock Pot contributions and pending/settled/cancelled point
  epochs. Migration `db/007_stock_pot_lifetime_points.sql` adds the v4 derived
  tables.
- V4 qualification is devnet-first. The acceptance gate is 100 accelerated
  settled rounds, ten cancellation rounds, exact basket/point reconciliation,
  and a two-hour unattended run. Testnet no longer carries a 100-round soak
  requirement.
- Source commit `b303635` passed the accelerated gate with 100 settled rounds,
  ten cancellations, 440 per-token reconciliations, zero accounting or point
  discrepancies, and exact indexer reconstruction of 111 rounds. The active
  clean-deployment endurance run
  `v4-devnet-2026-07-30T21-33-20-690Z` completed 24 naturally timed rounds,
  184 confirmed transactions, and all keeper, RPC, indexer, web, reorg, and
  duplicate-round recovery exercises. A round-five quote expired because Anvil
  advanced wall time while idle; transaction
  `0xefeba21a6e533ee01775fcd77f8318cf0db6485d74356a1f3576fa129f0a6134`
  reverted without charging and remains recorded as evidence. The controller
  retried it with a fresh deadline and completed the action. Final
  reconciliation contains 96 per-token rows, zero basket discrepancies, zero
  point discrepancies, zero failed assertions/actions, one recovered revert,
  and zero unresolved reverts. Reports:
  `artifacts/qualification/v4-devnet-2026-07-30T21-33-20-690Z.{json,md}`.
  Last verified 2026-07-30.
- V4 application snapshots resolve `RoundManagerV4.activeRound()` and are
  read-only. `services/v4-devnet-keeper.ts` owns local lifecycle transitions;
  `scripts/v4-devnet-soak.ts` owns deterministic qualification scenarios.
- The repository now contains a pnpm Next.js 16.2.12 application with React 19, Wagmi 3, Viem, React Query, Vitest, Playwright, and axe tooling.
- The complete responsive application, Foundry contracts, deterministic Anvil controller, local VM verification, and testnet deployment workflow are implemented.
- Permanent factions are removed. Every accepted contribution selects one of
  four configured ticker slots; the current holder cannot call again.
- DEX rounds lock GREEN/FLAT/RED scoring at 1.25x/1.0x/0.75x from a
  10-minute Uniswap V3 TWAP for each holder interval. FLAT rounds require no
  report and score every interval at 1.0x.
- Weighted points select the nonfinancial Closing Print Crown. The 30% Airtime
  Pool is divided across every caller by total raw control time across all
  tickers. DEX price, band, and multiplier cannot change any financial
  allocation. The 50% final-holder payout, 15% next-round seed, and 5% protocol
  allocation remain unchanged.
- `docs/prd/15-audit-candidate-airtime-pool.md` is archived v3 context.
- `docs/prd/10-closing-print-market-reactive.md` and `docs/prd/11-closing-print-user-stories.md` are the canonical current requirements. PRDs 01-09 remain historical/superseded context where marked.
- V4 requests a reusable maximum USDG allowance only when the current allowance
  is below the chosen contribution. The contract enforces a $1 minimum and no
  maximum; users can edit, reject, or revoke approval in their wallet.
- The reusable USDG allowance targets the permanent `PaymentRouter`, not an
  individual round. Operator-authorized round contracts can pull only their
  accepted claim fee, so a wallet does not approve again on rollover.
- The VM round keeper finalizes unattended expired rounds, archives the
  event-derived result, holds an eight-second Final Transmission, transfers the
  15% seed, and opens the next numbered round without rebuilding the app. The
  new round waits indefinitely with `startedAt == 0`; its first valid paid
  claim starts the clock and does not receive the later-claim extension.
  Rollover is single-flight and uses `.devnet/round-rollover.json` to resume
  safely after partial transaction sequences.
- The waiting Entry Desk makes the timer visually dominant with a fixed
  `00:45` broadcast-clock slab labeled `WAITING · FIRST $1 STARTS IT`. The live
  countdown replaces it after the opening claim.
- Desktop `/play/` routes use a fixed viewport-height studio. At widths above 820px the page footer is suppressed, the broadcast grid consumes only the space below the header/source bar, and height-aware sizing keeps the complete studio visible without vertical document scrolling.
- `docs/prd/09-implementation-gap-audit.md` records implemented gaps, intentional product gates, and external launch prerequisites.
- Local devnet is running on the VM at `http://192.168.50.138:3000`; Anvil chain ID `31337` is exposed at port `8545`. Last verified 2026-07-29.
- Deterministic local addresses are recorded in `deployments/31337.json`; the deployment script recreates a fresh funded round without storing private keys.
- The authoritative build workspace is VM `192.168.50.138`, user `hendo420`, path `/home/hendo420/projects/KeyGame`.
- The VM repository uses branch `main`, tracks `origin/main`, and pushes to the private GitHub repository `https://github.com/fourtytwo42/KeyGame`.
- `docs/fomo3d-game-logic-research.md` is the current technical baseline for original FoMo3D rules, formulas, accounting, timing, edge cases, and historical attacks.
- `docs/last-bell-product-concept.md` is the current proposed modern product synthesis, including the round state machine, payout model, mobile screen, meme vocabulary, Stock Token role, share loop, and staged launch.
- `docs/channel-4663-ui-design.md` is the selected palette, UI grammar, typography, motion, mascot, accessibility, responsive, and Next.js frontend direction.
- `docs/prd/README.md` indexes the implementation-facing PRD suite and is the requirements entrypoint.
- `docs/prd/11-closing-print-user-stories.md` is the current implementation backlog; `docs/prd/08-user-stories.md` is the superseded faction-era backlog.
- `/` is the one-game entrypoint and opens directly into the active studio. Legacy `/play/{roundId}` routes redirect to `/`.
- `/supported-assets` presents each roster stock as a team card with ticker,
  nickname, momentum state, point speed, 30-minute heat, and a plain-language
  payout explanation. Environment, custody, and price-source fields are
  intentionally omitted as redundant infrastructure detail.
- Completed devnet runs are stored as event-derived snapshots in `.devnet/round-history.json`, survive Anvil resets, and appear beneath the main studio with peak pot, final caller, Closing Print ticker, call count, and a full replay link. No fake history is seeded.
- GitHub Actions is disabled for this repository and no workflow is committed. All compilation and testing must run locally on the project VM. Last verified 2026-07-29.
- Production-shaped testnet infrastructure uses native PostgreSQL and four
  independent systemd services: market collector, DEX market adapter, indexer,
  and keeper. The old Data Streams service is disabled and retired.
- The active chain-46630 `closing-print-v3-airtime` deployment at block
  `95286752` uses manager
  `0x3c8e37ac53c9fcd869339313799cec1a3ecc71b5`, router
  `0x2840675D424943867c7b5E122972c328BFA2A88f`, mock USDG
  `0x360908e1a7A95B26ec4B098762b61d080d7C9Aba`, and verifier
  `0x8a6fb950579cdf1990260E489b057D1F229A3Ee0`. All four contracts are
  explorer-verified. The v2 DEX-payout deployment and older Chainlink
  deployment are archived under `deployments/archive/`.
- Native PostgreSQL plus collector, attestation adapter, indexer, keeper, and
  UAT web services are running against the corrected deployment. Round rollover
  is continuous, but every prepared round remains at `startedAt == 0` until its
  first accepted $1 claim.
- User lingering is enabled for `hendo420`, so the user-level collector,
  adapter, indexer, keeper, and UAT web services can start and remain active
  without an interactive login. All five were active after enabling it. Last
  verified 2026-07-29.
- Separate encrypted deployer, keeper, attestor, and faucet keystores exist
  outside the repository under the VM user's private configuration. Public
  addresses are recorded in the 2026-07-29 production-readiness entry below;
  passwords and private keys are not stored here.
- `docs/design/screens/README.md` is the visual handoff for all twelve planned app screens; `screen-contact-sheet.png` is the at-a-glance review artifact and `prompt-set.md` records the ImageGen direction.
- `docs/design/screens/desktop-live-on-air.png` is the desktop layout reference: a narrow center arena, rules and airtime on the left rail, and Trenches plus session controls on the right rail.
- Robinhood Chain is the intended deployment target. Closing Print is the approved prototype architecture; production deployment remains gated.
- Robinhood RPC traffic now uses server-side same-origin relays at
  `/api/rpc/testnet` and `/api/rpc/mainnet`. LAN nodes
  `192.168.50.117:8547` (testnet 46630) and `192.168.50.173:8547` (mainnet
  4663) are primary. Private Alchemy endpoints are configured only in the VM's
  untracked, mode-600 environment as fallbacks. The relay switches when the
  primary is unavailable or more than five blocks behind and does not expose
  provider credentials to browser JavaScript. Last verified 2026-07-29.
- The protected VM service environments now contain both Robinhood testnet and
  mainnet Alchemy fallback endpoints. Live chain-ID checks passed for 46630 and
  4663, and `/api/status` reported the LAN primary and testnet fallback at the
  same head with 7 ms and 47 ms observed latency respectively. Credentials are
  not stored in the repository or this memory file. Last verified 2026-07-29.

## User Preferences

- Keep `MEMORY.md` updated consistently with durable context that should survive chat compression.
- Agents should read `AGENTS.md` at startup and check `MEMORY.md` whenever context is missing, stale, or uncertain.
- Use uppercase filenames `AGENTS.md` and `MEMORY.md`.

## Source Of Truth

When sources conflict, use this order:

1. Current files in the workspace.
2. Latest command output or freshly verified tool output.
3. This `MEMORY.md` file.
4. Chat history.

## Freshness Rules

- Treat browser state, email state, authentication state, and external service results as stale unless verified in the current session.
- Treat documented repo structure, user preferences, and decisions as durable unless current files or fresh verification contradict them.
- Use `Last verified YYYY-MM-DD` for facts that can drift.

## Privacy Rules

- Do not store secrets, tokens, passwords, private keys, or sensitive personal data.
- Store only the minimum information needed for future handoff, especially when external systems or personal data are involved.

## Setup And Commands

- Frontend commands: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm test:all`.
- Devnet commands: `pnpm devnet:start`, `pnpm devnet:deploy`, `pnpm devnet:stop`, `pnpm app:start`, and `pnpm app:stop`.
- Contract commands: `forge fmt --check`, `forge test -vvv`, `pnpm contracts:deploy:local`, and `pnpm contracts:deploy:testnet`.
- `README.md` is the current local-devnet, wallet, verification, and Robinhood Chain testnet runbook.
- Research verification used the verified deployed source, public Ethereum JSON-RPC storage reads, and independent BigInt reproduction of the key curves.
- VM last verified 2026-07-28: Ubuntu 24.04 LTS at `192.168.50.138`, SSH user `hendo420`, project path `/home/hendo420/projects/KeyGame`.
- Dedicated local SSH key: `C:\Users\hendo420\.ssh\keygame_vm_ed25519`. Do not store the VM password in this repository or memory.
- VM root storage was expanded online from a 31 GiB LVM logical volume to the full 62 GiB volume; `df -h /` reported 61 GiB usable and approximately 52 GiB free after expansion.
- VM toolchain last verified 2026-07-28: Git 2.43.0, GitHub CLI 2.45.0, Node v24.18.0 through nvm, pnpm 11.17.0, GCC 13.3.0, jq 1.7.
- GitHub CLI last verified 2026-07-28 as authenticated account `fourtytwo42` using HTTPS Git operations. Authentication secrets remain in the VM user's GitHub CLI configuration and are never stored in this repository.

## Project Map

- Project purpose: Research and potential implementation of a key-based last-buyer game informed by the original FoMo3D contracts.
- Main workflow: Use the research document as the rules baseline before defining or building a game.
- External systems: Ethereum mainnet history, Etherscan, Blockscout, Robinhood Chain, Robinhood Stock Token registry/APIs, Chainlink price feeds, and public technical archives.
- Important paths:
  - `AGENTS.md`: repository-local agent workflow and memory rules.
  - `MEMORY.md`: durable context store.
  - `docs/fomo3d-game-logic-research.md`: complete researched mechanics for verified FoMo3D Long and Soon, plus source boundaries and redesign guidance.
  - `docs/last-bell-product-concept.md`: proposed product design for the Robinhood Chain modernization.
  - `docs/channel-4663-ui-design.md`: selected visual system and Next.js frontend architecture.
  - `docs/prd/`: linked product, game, UX, technical, risk, analytics/QA, delivery, and user-story requirements.
  - `docs/design/screens/`: Channel 4663 reference, twelve ImageGen screen concepts, gallery, contact sheet, and prompt set.

## Architecture Notes

- Implemented architecture: Next.js App Router and Server Components for public routes, narrowly scoped Client Components for simulator, replay, receipt sharing, wallet state, and live interactions; shared typed domain under `src/lib/game`; Wagmi/Viem under `src/lib/web3`; one global Channel 4663 CSS system.
- `contracts/LastBellRound.sol` implements ticker-per-claim control, DEX/flat
  modes, locked nonfinancial Crown weighting, Producer Pass gating, all-caller
  raw-time Airtime settlement, exact remainder conservation, cancellation
  refunds, and pull payments.
- `contracts/mocks/MockUSDG.sol`, `MockMarketDataVerifier.sol`, and `MockStockToken.sol` are devnet-only.
- Devnet mode reads the deployed contract and events through `src/lib/web3/devnet.ts`; the development action API selects prejoined deterministic Anvil accounts and submits real transactions.
- Wallet configuration includes injected EIP-6963 wallets, MetaMask, Coinbase Wallet, Safe, and optional WalletConnect through a Reown project ID. No extension connection has been claimed as tested.
- Robinhood Chain testnet is configured as chain ID `46630`; `script/DeployTestnet.s.sol` consumes environment configuration and does not embed a signing key.
- The research separates the economic state machine into players/vaults, per-round key balances and masks, key-price curves, timer/leader updates, external distributions, airdrop state, and settlement.
- Original FoMo3D behavior contains known vulnerabilities and accounting defects. Historical fidelity and production-safe behavior must be treated as separate modes or designs.
- Proposed direction, not yet approved: “Last Bell,” a short market-arena round where users lock canonical Stock Tokens, pay a small explicit USDG action fee to claim control, accrue time-weighted control score, receive locked principal back after settlement, and compete for a fee/sponsor-funded prize. A final-leader bonus preserves countdown tension without making one last transaction the whole outcome.
- Proposed launch split: global USDG/stock-data mode first, then actual Stock Token locking only for eligible users after product counsel and an eligibility-attestation design.
- Avoid a native game token, ICO, affiliate tree, random airdrop, perpetual emissions, uncapped overtime, and opaque key-holder dividends in the initial design.
- Memeability proposal, not yet approved: make a single three-minute “Flash Bell” the primary loop, reduce play to pick a ticker plus tap `APE`, use a final capped “Cope Zone,” and show faction control time plus the final bell holder as the two instantly understandable outcomes.
- Build sharing into the state machine: crown thefts, losses, comebacks, and wins produce deterministic vertical meme receipts/Open Graph cards. Use ticker factions, rotating community mascots, cosmetic seasons, and raid links without monetary referral rewards.
- Meme-language proposal, not yet approved: use a fixed semantic lexicon rather than interchangeable slang. Proposed core: `APE` = take the claim action, `COOKING` = building control momentum, `COOKED` = losing badly or eliminated, `RUGGED` = ordinary bell theft, `SNIPED` = final-seconds theft, `BAG SECURED` = win, `THE TRENCHES` = live arena/feed, and `SEND IT` = high-stakes confirmation. Keep `jeet`, `exit liquidity`, `honeypot`, and `rug pull` out of official product copy because they are derogatory or imply protocol fraud.
- Approved round: four automatically selected ticker slots, 45-second opening clock, $1 accepted claim, two-second normal extension, 180-second hard cap, ten-second non-extendable Rug Zone, and no Stock Token custody.
- Approved payout: 50% to the final holder, 30% to all callers by total raw
  control time, 15% next-round seed, and 5% protocol operations. Weighted DEX
  points award only the nonfinancial Closing Print Crown.
- Comprehension rule: `Pick a stock. Pay $1 to put it on air and steal the bell. Market momentum boosts its airtime. Hold the bell at zero to win 50%.`
- Selected visual direction: `Channel 4663`, a fictional late-night public-access market game show named for Robinhood Chain ID 4663. Use broadcast identifiers, teletext-density score strips, a studio-switch action, transmission receipts, square/clipped color slabs, awkward three-color mascots, and the `Dead Channel` palette. Avoid dark-green fintech, neon cyberpunk, glassmorphism, neo-brutalism, casino/gacha polish, generic shadcn dashboards, gradients, glows, card stacks, and corporate ticker branding.
- Selected frontend direction: Next.js 16.2.x App Router with strict TypeScript, React Server Components by default, narrowly scoped Client Components for the live arena, CSS Modules plus global tokens, `next/font`, native CSS/Web Animations, and `viem`. Do not use Tailwind, shadcn/ui, a dashboard template, or Framer Motion as the default implementation.
- Approved prototype constants: four ticker slots, one-USD-equivalent test action, 45-second initial deadline, two-second normal extension, 180-second hard end, final-ten-second Rug Zone, +/-5 basis-point bands, 1.25/1.0/0.75 multipliers, and 50/30/15/5 settlement. These remain configurable between rounds and immutable during a round.
- Approved engineering bootstrap: Git, pnpm, pinned compatible active-LTS Node metadata, strict TypeScript, ESLint, Prettier, typed environment validation, Vitest plus React Testing Library, Playwright, axe-core, and screenshot regression. Run all gates locally on the project VM; do not use GitHub Actions.
- Approved implementation order: shared typed domain model and ten deterministic fixture scenarios before stateful screen logic; then the complete static Home through Dead Air screen slice across mobile, desktop, keyboard, and reduced-motion states.
- Players may change ticker on every accepted claim; same-holder claims revert. Ticker-score ties use the most recent accepted acquisition, then the lower configured ticker index.
- PRD status discipline: `DECIDED` requirements may guide implementation; `SELECTED FOR PROTOTYPE`, `PROPOSED`, `OPEN`, and `GATE` items retain their labeled uncertainty and cannot be silently promoted to production decisions.

## Verification Ledger

- 2026-07-31: Accepted isolated torture run
  `v4-torture-live-2026-07-31T03-44-39-339Z`. Ten 100,000-action Foundry
  shards passed; the live campaign produced 10,000 accepted contributions,
  500 settlements, 50 cancellations, 2,200 per-token reconciliation rows,
  13,825 distinct confirmed transaction hashes, and 4,760,602,565 total gas
  units. All ten faults restored, the indexer caught up exactly to block 14715,
  and basket, point, assertion, action, and unresolved-revert discrepancies
  were all zero.
- 2026-07-31: Final local gates passed on the VM: formatting, ESLint,
  TypeScript, 50 Vitest tests, 43 Foundry tests including 512-run fuzz and
  8,192-call invariant coverage, four isolated integration tests, production
  build, protected-bundle scan, and 20 Playwright desktop/mobile tests with two
  intentional viewport skips. Browser and integration tests now accept
  explicit devnet manifest and RPC paths so torture UAT cannot target the
  qualified port-8545 deployment.
- 2026-07-31: The isolated `v4-torture` Foundry campaign completed ten
  deterministic 100,000-action shards with exactly 1,000,000 actions and no
  invariant failure at source `c9acd2d`. The first live attempt reached 394
  clean settlements before action 395 exposed a keeper retry defect. The
  failure is a harness lifecycle issue, not an accounting mismatch: round 5057
  finalized successfully, but an earlier expected `InvalidTransition` had
  poisoned round 5058's idempotency key. The indexer also exposed a reliance on
  pruned historical state for immutable ticker metadata. Both paths require a
  clean live rerun after repair.
- 2026-07-31: Clean torture source `7a15248` passed a fresh 1,000,000-action
  contract campaign and 500 live settlement rounds with all six restart faults,
  no failed keeper jobs, and no failed actions. The first cancellation did
  cancel and roll onchain, but the controller falsely failed because its wait
  predicate excluded the Cancelled terminal phase. This is a harness
  observation defect; its evidence is preserved and requires a clean rerun
  after the predicate fix.
- 2026-07-30: Implemented `last-bell-v4-stock-pot`. Final local gates passed:
  48 Vitest tests, 4 clean-chain integration tests, 37 Foundry tests including
  512-run v4 fuzzing, 20 Playwright desktop/mobile checks with two intentional
  project-specific skips, axe serious/critical checks, formatting, ESLint,
  TypeScript, production build, and protected-bundle scan. Browser UAT confirmed
  the paid action at 1280x720 and 390x844. The VM required Playwright Linux
  browser dependencies, which are now installed.
- 2026-07-30: Exercised at least three sequential devnet rounds with $1, $10,
  $250, $1,000, $5,000, and custom contributions; verified heat, decay, cap,
  ticker flips, first-call start, Rug Zone, settlement, exact cancellation
  Stock Token refunds, lifetime reward claims with unchanged points, seed
  carry, and automatic rollover. Added a Foundry changed-roster test proving
  old seed liquidation and equal-USDG rebuy across four replacement stocks.
- 2026-07-30: Generated the non-broadcast testnet package at
  `artifacts/last-bell-v4-testnet-ready.tgz`. The guarded chain-46630 deployment
  script fails closed on missing authorization, wrong chain, dirty/unpushed
  source, exposed RPC accounts, insufficient deployer gas, and failed local
  build/tests.
- 2026-07-30: Replayed a fresh v4 Anvil deployment through PostgreSQL with zero
  confirmations. The indexer decoded manager, round, and lifetime events,
  materialized four accepted contributions totaling 1,360 USDG and 1,360
  points, and promoted the four matching player point epochs at settlement.
- 2026-07-30: Completed PRD 14 implementation and live VM acceptance at commit
  `504c4e2`. Migration `005_retention_and_deployment_identity.sql` and the
  deployment-history backfill reconstructed three deployments and nine
  historical rounds. Final gates passed 47 Vitest tests, 28 Forge tests, four
  Anvil integration tests, both VM builds, protected-bundle scanning, and 20
  Playwright tests with two intentional cross-project skips. All five testnet
  services were active; `/api/status` reported healthy LAN and fallback RPCs,
  PostgreSQL, keeper, DEX adapter, collector, and deployment-aware indexer.
- 2026-07-30: In-app browser UAT used two independently generated session-only
  testnet wallets. It verified faucet funding, one reusable $100 approval,
  first-$1 timer activation, a second wallet stealing the bell with AAPL,
  weighted points versus raw payout airtime, settlement, automatic round
  preparation, SIWE login, two public profiles, chain-derived caller history,
  one-wallet/one-vote eligibility, and an atomic `2/2` raid countdown.
  Browser UAT found and fixed deployment-scoped activation-job conflict keys,
  raid interval SQL typing, zero live-pot projections, numeric ticker labels,
  final-holder airtime reconstruction, missing legacy earning-rate fallback,
  and compact desktop/mobile clipping.
- 2026-07-30: The earlier v2 simulations found all five eligible pools below a
  10x manipulation-cost margin at a modeled $100 pot and measured a 9.865x
  automated-wallet Rug advantage. V3 removes DEX influence from every financial
  allocation, so pool manipulation evidence now gates Crown integrity rather
  than payout security. FCFS automation is an accepted disclosed product
  property. Audit, legal, Safe, Reown, canonical-map, incident-owner, soak, and
  explicit release gates still block mainnet.
- 2026-07-30: V3 final verification passed 29 Forge tests, 48 Vitest tests,
  four live-Anvil integration tests, the mainnet-fork TWAP test, protected
  bundle scanning at commit `f246a7d`, and browser acceptance at 1280x720 and
  390x844. Testnet UAT settled and withdrew both all-caller Airtime shares with
  exact dust conservation. The active 24-hour soak has persisted its first two
  approvals and two calls and currently reports one confirmed action, zero
  failures, and 99 scheduled actions.
- 2026-07-30: Removed the Bags card diagonal corner pseudo-element after live
  browser inspection showed it crossing the upper-right momentum badge. Devnet
  and testnet production builds passed; browser verification confirmed all four
  status badges are unobstructed and the page has no horizontal overflow.
- 2026-07-30: Refined the live Closing Print scoreboard in both devnet and
  testnet. Shortened the header to `THE CLOSING PRINT` plus a compact mode tag,
  separated weighted points from payout airtime into labeled cells, and kept
  all four rows inside the 720px desktop studio. Lint, typecheck, 34 app tests,
  both production builds, and live browser layout measurements passed.
- 2026-07-30: Redesigned the Bags cards in both VM devnet and Robinhood
  testnet builds. Removed Environment, Custody, and Price Source; added team
  identity, momentum dial, point speed, 30-minute heat, roster rank, and
  per-stock game explanation. Lint, typecheck, 34 app tests, and both
  production builds passed. Browser checks confirmed four cards, no removed
  labels, and no desktop horizontal overflow.
- 2026-07-30: Deployed and explorer-verified the DEX-attested package on
  Robinhood testnet at block `95124915`. Browser UAT proved round 2 settlement,
  round 3 FLAT fallback and rollover, round 4 automatic DEX preparation, one
  reusable approval across rounds, and an accepted NVDA claim backed by
  mainnet pool `0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3`, source chain 4663,
  and persisted source block/hash evidence. The live collector had 100+ samples
  for all five safe markets. Fixed the news-crawl click overlay,
  deployment-scoped keeper idempotency, stale archived service health, and
  status round selection. App tests: 34 passed.
- 2026-07-29: Implemented the DEX-powered onchain momentum replacement. VM
  verification passed 28 Forge tests, including a live mainnet-fork read of
  NVDA/USDG's 10-minute Uniswap V3 TWAP, plus lint, typecheck, 34 Vitest tests,
  and the Next.js production build. Migration `004_dex_onchain_momentum.sql`
  applied successfully. A live collector pass persisted safe TWAP observations
  for AAPL, AMZN, NVDA, SPY, and TSLA; each pool exceeded 10,000 USDG depth and
  stayed below the configured 1% two-sided 1,000 USDG impact limit.
- 2026-07-12: Read `AGENTS.md` and `MEMORY.md`; identified stale project-specific memory and preserved the repository-local instruction logic.
- 2026-07-12: Checked the workspace root; confirmed `AGENTS.md` and `MEMORY.md` are present and no `.git` directory is present at this level.
- 2026-07-28: Cross-checked FoMo3D Long at `0xA62142888ABa8370742bE823c1782D17A0389Da1` against its verified Solidity 0.4.24 source.
- 2026-07-28: Cross-checked FoMo3D Soon at `0x4e8ecF79AdE5e2C49B9e30D795517A81e0Bf00B8` against its deployed source and compiler metadata.
- 2026-07-28: Ethereum storage reads confirmed the bidirectional Long/Fast link between Long and `0xF9bA0955b0509AC6138908cCc50d5Bd296E48D7D`; the latter's complete source is not currently verified.
- 2026-07-28: BigInt curve checks reproduced the source's first-key values: Long `75,000,000,000,000` wei and Soon `100,000,000,000,000` wei.
- 2026-07-28: Validated the research Markdown: 906 lines, 5,600+ words, balanced code fences, required sections present, and 13 unique source links. Direct checks returned 200 for open archives; Etherscan and Medium returned bot-facing 403 responses but remained browser-valid references.
- 2026-07-28: Last verified Robinhood Chain mainnet is live, EVM-compatible Arbitrum L2 chain ID `4663`, uses ETH for gas, advertises 100 ms blocks, first-come/first-served sequencing, Chainlink feeds, and ERC-4337/EIP-7702 account-abstraction support.
- 2026-07-28: Robinhood's live asset API returned 96 active canonical Stock Tokens on chain ID `4663`, including AAPL, NVDA, MSFT, GOOGL, AMZN, META, TSLA, SPY, and QQQ.
- 2026-07-28: Stock Tokens are 18-decimal ERC-20 tokenised debt securities, not ownership of underlying shares. Their Chainlink prices already include the ERC-8056 corporate-action multiplier; do not multiply an onchain feed price by `uiMultiplier()` again.
- 2026-07-28: Live DeFiLlama snapshot showed approximately $308.35B stablecoin market cap, $40.31B lending TVL, $26.60B RWA TVL, and $43.22B seven-day DEX volume. High-fee categories included DEXs, perpetuals, launchpads, prediction markets, and lending.
- 2026-07-28: Latest accessible DappRadar/BGA sector data showed 4.66M daily gaming wallets and 25% dapp activity share in Q3 2025, while warning that mainstream retention remains unsolved and wallet counts do not equal people.
- 2026-07-28: Created `docs/last-bell-product-concept.md` and an interactive mobile-round explainer covering entry, battle, Rug Zone, and settlement receipt states.
- 2026-07-28: Revised the concept and mobile explainer for five-second comprehension, a fixed $1 claim price, a 50% final-holder headline prize, a 30% faction bonus, and visible bounded-session spend.
- 2026-07-28: Verified the selected `Dead Channel` text/background pairs at WCAG AA or better, with contrast ranging from 5.02:1 to 15.65:1 for normal text.
- 2026-07-28: Verified current Next.js documentation exposes version 16.2.12 and directly supports App Router, TypeScript, CSS Modules, and optimized self-hosted fonts.
- 2026-07-28: Rendered and browser-checked the Channel 4663 explainer at 736 px and a 328 px inner viewport; the narrow layout had no horizontal overflow, the Rug Zone interaction updated correctly, and the browser reported no page errors.
- 2026-07-28: Created and validated eight PRD Markdown files totaling 10,165 words with 332 unique table-defined decision/requirement IDs. All local Markdown links resolve, all code fences are balanced, and no stale $0.25, 45/35 payout, or Cope Zone references remain in the suite.
- 2026-07-28: Generated and visually reviewed twelve portrait Channel 4663 screen concepts with built-in ImageGen: Home, Entry, Live, Rug Zone, Finalizing, Final Transmission, Replay, Receipt, Rules, Wallet/Session, Supported Assets, and Dead Air. Copied all final assets into `docs/design/screens/`, recorded the prompt set, and created a four-by-three contact sheet.
- 2026-07-28: Gallery validation found all 12 numbered screen images, the contact sheet, and the prompt manifest present with zero broken local Markdown links.
- 2026-07-28: Generated and visually reviewed the desktop Live / On Air reference at landscape 16:9. It preserves the center gameplay hierarchy and uses side rails only for rules, airtime, activity, bounded session state, and secondary links.
- 2026-07-28: Embedded the design-system reference, contact sheet, all 12 mobile concepts, and the desktop Live concept into PRD 03. Validation found 15 embedded images in PRD 03, one contact-sheet image in the PRD index, and zero broken image paths.
- 2026-07-28: Validated `docs/prd/08-user-stories.md`: 66 unique stories across 13 epics, 66 story/priority/acceptance/trace blocks, 212 unique traced source requirements, zero invalid trace IDs, zero duplicate story IDs, and zero broken local links.
- 2026-07-28: Validated the approved kickoff PRD update across nine documents: 403 unique table-defined IDs, zero duplicate IDs, zero broken local links, balanced code fences, 212 valid user-story trace IDs, and 11 `GAME-CFG-*` values selected for prototype use.
- 2026-07-28: Verified the new VM as Ubuntu 24.04 LTS with a 64 GiB disk; extended `ubuntu-vg/ubuntu-lv` and ext4 online from 31 GiB to 62 GiB, leaving approximately 52 GiB free.
- 2026-07-28: Installed and verified GitHub CLI, build-essential, jq, unzip, nvm, Node v24.18.0, and pnpm 11.17.0; added dedicated key-based SSH access.
- 2026-07-28: Copied 31 project files totaling about 22.9 MB to `/home/hendo420/projects/KeyGame`; SHA-256 verification found 31 matching files, zero mismatches, and zero extras before Git initialization.
- 2026-07-28: Created initial commit `2d74289b8aead3d62e7f6f0dea201b35f0ce1daf`, created private repository `fourtytwo42/KeyGame`, pushed `main`, and verified the local and remote commit hashes matched.
- 2026-07-28: Generated `docs/design/assets/last-bell-mascot.png` with built-in ImageGen from the approved Channel 4663 reference, removed a keyed magenta background, inspected the transparent result, and derived favicon, Apple icon, app icons, and Open Graph assets.
- 2026-07-28: Verified the first application slice on the VM with `pnpm typecheck`, `pnpm lint`, six deterministic simulator tests, and `pnpm build`; all passed. The build emitted only non-blocking fallback-metric warnings for two Google fonts.
- 2026-07-28: Final frontend gates passed on the authoritative VM: Prettier, TypeScript, ESLint, 11 Vitest unit/component tests, and the Next.js production build.
- 2026-07-28: Final Foundry suite passed 11 contract tests, including 512 fuzz runs for Rug Zone non-extension, payout conservation, pull claims, refunds, self-claim rejection, hard-cap enforcement, and deterministic faction settlement.
- 2026-07-28: Real Anvil integration suite passed 3 tests covering snapshot reads, a browser-equivalent claim, Rug Zone behavior, and finalization.
- 2026-07-28: Playwright passed 12/12 tests in installed Chrome across desktop and Pixel 7 profiles: five-second comprehension, real devnet claim, wallet panel, all public routes, axe serious/critical checks, and horizontal-overflow checks.
- 2026-07-28: In-app browser UAT verified the live Anvil source, the $1 claim action, deterministic NVDA tie leader, wallet choices and WalletConnect configuration notice, mobile 390x844 layout with no horizontal overflow, literal rules/constants, and zero browser console errors.
- 2026-07-28: GitHub Actions run `30421210958` passed all three hosted jobs: app, contracts, and browser. The browser job independently installed Chromium, deployed Anvil, ran integration tests, reset the chain, and passed all Playwright tests.
- 2026-07-28: Corrected a CI-only timing assumption by comparing contract deadlines instead of snapshot countdowns, then isolated stateful integration and E2E suites with a fresh devnet deployment.
- 2026-07-28: Reconciled the full PRD suite against the app and implemented immutable faction entry, $5/$10/$25 onchain spend ceilings, allowance revocation, wallet writes, holder/faction/refund pull claims, correct 15% next-round seed semantics, enriched canonical events, and deployed-state replay/receipts.
- 2026-07-28: Final reconciliation gates passed on the VM: TypeScript, ESLint, 14 Vitest tests, 12 Foundry tests including 512 fuzz runs, 3 live Anvil integration tests, production build, and 11 Playwright desktop/mobile tests with one deliberate duplicate-mutation skip.
- 2026-07-28: In-app browser UAT verified the authoritative entry/session state, revoke transition, automatic settlement, 50/30/15/5 allocations, holder and faction claims, canonical replay identity, and receipt chain/block/contract proof.
- 2026-07-28: Pushed the reconciliation implementation as commit `5f25c956999fe491a95f3c8cc66af0a68f3a0675`; GitHub Actions run `30423038363` passed app, contracts, and browser jobs.
- 2026-07-28: Replaced $5/$10/$25 max-spend sessions with a reusable $100 play-USDG allowance and a below-$10 refresh threshold. Local and VM unit/type/lint checks passed; 12 Foundry tests passed including allowance-constrained claims; 4 live Anvil integration tests passed including threshold refresh; production build passed; Playwright passed 11 tests with one deliberate duplicate mobile mutation skip; in-app browser UAT verified AAPL entry at $100 and a successful $1 claim reducing the allowance to $99.
- 2026-07-28: Pushed the reusable-allowance implementation as commit `7fb21f6cdbdfc80468930def49f897147f36662f`; GitHub Actions run `30424178882` passed app, contracts, integration, and browser jobs.
- 2026-07-29: Measured the reported in-app browser viewport at 1522x911; the pre-fix studio document was 1090px tall, producing 179px of vertical overflow. After the CSS correction, document scroll height equals viewport height at both 1522x911 and 1280x720, with entry and final-state actions visible. Formatting, TypeScript, ESLint, 14 unit/component tests, production build, and Playwright passed; Playwright reported 12 passed and 2 intentional skips.
- 2026-07-29: Closing Print final verification passed on the authoritative VM: formatting, ESLint, TypeScript, 23 Vitest tests, production build, 12 Foundry tests including 512 fuzz runs, and four live-Anvil integration tests.
- 2026-07-29: Playwright against the VM devnet passed 14 desktop/Pixel 7 checks with two intentional cross-profile skips. It covered first paid entry, four ticker claim controls, visible market bands, mobile Closing Print standings, public proof routes, WCAG serious/critical checks, and overflow.
- 2026-07-29: In-app browser UAT verified the live Anvil source, all four market-labeled controls, visible Closing Print state, exact 1280x720 desktop viewport fit, and mobile 390x844 horizontal fit. A fresh round was left running for handoff.
- 2026-07-29: At user direction, canceled the active hosted run, disabled GitHub Actions at the repository permissions level, deleted the workflow, and moved all release gates to the VM.
- 2026-07-29: Added `--slow` to the local Forge broadcast because parallel transaction submission could leave nonce-dependent deployments pending on a freshly restarted Anvil. A clean stop/start/deploy completed at block 37 after the change.
- 2026-07-29: Rewrote `/rules` in plain high-school-level language. The page now leads with the three-step loop, explains market bands as +/-0.05% rather than basis points, describes both winners directly, and makes clear that the $100 approval is a limit rather than a charge. VM format, lint, typecheck, 23 tests, production build, and in-app browser review passed.
- 2026-07-29: Replaced the separate marketing home with the live game at `/`, redirected legacy play URLs, removed Final Transmission receipt/replay buttons, and added a VM-local Historical Runs archive. The first real archived run recorded a $51 peak pot, `caller-70997`, NVDA, and one call; its replay resolved with canonical chain, contract, block, and event details. VM lint, typecheck, 24 tests, build, desktop/mobile browser checks, and archive-link UAT passed.
- 2026-07-29: Removed Signal/System Status links from the primary navigation and footer. `/status` remains available by direct URL for operator health checks but is not advertised to players.
- 2026-07-29: Continuous-round Playwright acceptance passed 14/14 applicable desktop and Pixel 7 checks with two intentional cross-profile skips after correcting the Historical Runs foreground fallback from the undefined `--paper` token to `--dead-air`. The VM's Chromium runtime libraries are locally extracted under `.devnet/playwright-root`; use that directory in `LD_LIBRARY_PATH` unless the dependencies are installed system-wide.
- 2026-07-29: First-claim timer-start verification passed on the VM: 17 Forge tests, 24 app tests, four live-Anvil integration tests, lint, typecheck, production build, and 14 applicable Playwright checks with two intentional skips. In-app browser UAT observed a waiting carried-seed round with no holder, then a successful first $1 claim at exactly 00:45. Devnet report generation now mines a fresh block before encoding deterministic reports so Anvil time offsets cannot expire the first post-rollover claim.
- 2026-07-29: Final clean devnet handoff left deterministic round 4663 on the Entry Desk with a $50 seed pot, `startedAt == 0`, no holder, and zero claims across repeated checks. The keeper remains running but will not start the timer.
- 2026-07-29: Added the prominent waiting-state `00:45` clock after user feedback that the pot and spread visually obscured the main mechanic. VM lint, typecheck, 24 app tests, production build, and 14 applicable Playwright checks passed with two intentional skips. In-app browser review confirmed the timer is visible at desktop and 390x844 mobile widths, desktop studio bottom equals the viewport bottom, and neither layout has horizontal overflow.
- 2026-07-29: Added Robinhood Chain mainnet mode and a restricted same-origin
  RPC relay with LAN-primary, Alchemy-fallback routing for testnet and mainnet.
  Live relay checks returned chain IDs 46630 and 4663 through the LAN providers;
  a forced invalid-primary test returned chain ID 4663 through the fallback.
  VM ESLint, TypeScript, 27 Vitest tests, and production build passed. Provider
  credentials remain untracked and server-only.

## Decisions

### 2026-07-12 - Reset Stale Project Context

- Removed old project identity, history, setup details, external-system references, and follow-ups from this memory file.
- Preserved the memory-system rules, privacy guidance, source-of-truth ordering, freshness rules, and handoff structure.

### 2026-07-28 - Define the Original FoMo3D Research Boundary

- Treat the verified Long and Soon deployed sources as authoritative for complete logic.
- Treat the separately deployed `0xF9bA...` Fast game as an official linked contract but do not infer its complete behavior from Soon while its source is unverified.
- Exclude modern projects that merely reuse the FoMo3D name.
- Preserve original defects in the research record, but recommend fixing them in any real-money redesign.

### 2026-07-28 - Target Robinhood Chain for the Modern Version

- Use Robinhood Chain as the intended deployment environment.
- Modernize the game rather than reproducing the original economic and security defects.
- Advanced FoMo3D features such as the ICO, affiliate system, and random airdrop are out of the desired initial scope.
- Product concept and payout design remain proposals until the user selects them.

### 2026-07-28 - Select Channel 4663 and Next.js

- Use the `Channel 4663` late-night public-access broadcast metaphor as the selected visual direction.
- Use the `Dead Channel` eight-color palette and three-typeface system documented in `docs/channel-4663-ui-design.md`.
- Keep unusual visuals subordinate to the literal five-second game explanation.
- Build the frontend with Next.js 16.2.x App Router, TypeScript, CSS Modules, `next/font`, and narrowly scoped client-side arena components.
- Reject generic fintech, Web3, casino, neo-brutalist, glassmorphic, and pre-skinned dashboard patterns.

### 2026-07-28 - Use One Reusable Play-Token Approval

- The first starter-ticker claim ensures a $100 play-USDG allowance and charges exactly $1; there is no separate entry transaction or max-spend picker.
- Each successful bell claim still transfers exactly $1.
- Before a claim, the client requests a fresh $100 approval only when the existing allowance is below $10.
- ERC-20 allowance and balance are the onchain spend constraints. The player may edit or reject the approval in the wallet and may revoke it from the app or wallet.

### 2026-07-29 - Replace Factions With Closing Print

- Remove permanent faction membership and select a ticker on every accepted claim.
- Configure exactly four canonical ticker slots per round, each with a Stock Token address, stream ID, visuals, and immutable opening reference.
- VERIFIED claims require a fresh matching signed report and lock GREEN/FLAT/RED weighting for the full holder interval. FLAT rounds use 1.0x without reports.
- Stock Token balances are never custody or score weight. Producer Pass is a binary special-round gate and badge only.
- Keep replay compatibility through explicit `closing-print-v1` and legacy `faction-v0` event parsers.

### 2026-07-29 - Keep Builds Off GitHub

- GitHub is source control only for this project.
- Do not compile, test, run browsers, or spend Actions minutes on GitHub.
- Keep GitHub Actions disabled and run all verification on `/home/hendo420/projects/KeyGame`.

### 2026-07-29 - Start The Timer With The First Paid Claim

- Operator initialization verifies opening reports and deposits the seed but
  does not set `startedAt`, `deadline`, or `hardEnd`.
- The first valid `$1` `claimBell` sets the 45-second clock and 180-second hard
  cap, becomes claim number one, and receives no two-second extension.
- Automatic rollover configures and funds the next round, then waits on the
  Entry Desk without an automatic caller or timeout.

## Known Issues

- Real Stock Token custody, player-funded prizes, account abstraction/gas sponsorship, and production compliance remain intentional PRD gates, not missing Stage 1 implementation.
- Wallet connectors are implemented but intentionally not extension-tested in this devnet-only goal. WalletConnect requires a real Reown project ID and origin allowlist.
- Robinhood Chain testnet core contracts are live and use KeyGame mock USDG plus
  a testnet-attested verifier. No round has been prepared or activated yet.
- Chainlink Data Streams are no longer a runtime dependency. Testnet uses
  domain-bound attestations of genuine Robinhood mainnet Uniswap V3 TWAP
  observations; mainnet is designed to read the configured pool directly.
- The user's funding wallet received 5 each of TSLA, AMZN, PLTR, NFLX, and AMD
  from testnet token contracts that differ from the pinned Robyn mock catalog.
  Their provenance and compatibility must be verified before replacing or
  extending the pinned mappings.
- GitHub Actions is intentionally disabled. Do not add or enable hosted workflows without explicit new user authorization.
- The production build emits non-blocking fallback-metric warnings for Atkinson Hyperlegible Next and Big Shoulders Stencil.
- Contracts have extensive local tests but no independent security audit.
- Original FoMo3D includes predictable airdrop randomness, block-stuffing exposure, contract-wallet exclusions, external-call dependencies, integer-boundary quirks, and several documented accounting/view defects.
- Any real-money implementation would require security and current legal/regulatory review.
- Robinhood Stock Tokens are unavailable to U.S. persons and restricted in other jurisdictions. A permissionless contract plus frontend geo-block is not automatically a sufficient compliance design.
- First-come/first-served sequencing reduces gas-price queue jumping but does not eliminate latency advantages, Sybil activity, sequencer censorship risk, or automated play.

## Completed Work

- 2026-07-30: Implemented and deployed the `closing-print-v3-airtime` audit
  candidate. Weighted DEX points now select only the nonfinancial Closing Print
  Crown; the 30% Airtime Pool pays every caller by total raw control time, and
  the final claimant receives exact integer dust. Foundry passed 29 tests,
  including 512-run payout-independence and scoring fuzz tests plus the
  Robinhood mainnet-fork TWAP test. VM application gates passed TypeScript,
  ESLint, 48 Vitest tests, four live-Anvil integration tests, production/UAT
  builds, and the protected-bundle scan.
- 2026-07-30: Deployed the v3 Robinhood testnet package from source commit
  `6b0b8479bbbabc75b34bafbfcd6d6f538602914e` at block `95286752`.
  Blockscout verified mock USDG `0x360908e1a7A95B26ec4B098762b61d080d7C9Aba`,
  verifier `0x8a6fb950579cdf1990260E489b057D1F229A3Ee0`, manager
  `0x3c8e37ac53c9fcd869339313799cec1a3ecC71b5`, and router
  `0x2840675D424943867c7b5E122972c328BFA2A88f`. Live role and seed checks
  passed. The old v2 deployment is archived explicitly.
- 2026-07-30: Completed v3 browser UAT with two isolated session wallets:
  corrected a stale v2 client token address before funding; verified reusable
  allowances, first-call timer start, cross-wallet ticker stealing, visible
  FCFS Rug disclosure, settlement, replay, profile creation, and a two-voter
  raid entering COUNTDOWN. The final wallet withdrew its 50% holder reward and
  26/47 Airtime share; the other caller withdrew 21/47. Live reads showed
  `claimedControlTime == totalControlTime == 47` and
  `airtimePoolPaid == airtimePool == 989250`. Desktop 1280x720 and mobile
  390x844 had no horizontal overflow, clipped buttons, sub-11px financial
  labels, or console errors.
- 2026-07-30: Added the PostgreSQL-backed durable soak controller, testnet-only
  authenticated fault schedule, isolated reorg/duplicate fixtures, unprivileged
  reversible RPC-primary failure marker, encrypted external soak wallets, gas
  reserve handling, persisted transaction hashes, and reconciliation. Active
  run `soak-2026-07-30T14-58-01-684Z` began at 14:58 UTC with 100 actions
  spread over 24 hours. The first action confirmed two approvals and two calls
  with all four transaction hashes persisted; six services report active.

- 2026-07-29: Implemented the Robinhood testnet production-readiness
  architecture: versioned manifests, RoundManager, testnet attested verifier,
  Chainlink V8/V10 equity decoder, PostgreSQL migrations, official Robinhood
  market collector, reorg-aware indexer, durable serialized keeper, Data
  Streams adapter, dynamic snapshots/status, isolated browser UAT wallet and
  faucet, systemd units, protected-bundle scanning, and fail-closed deployment.
  VM verification passed 25 Foundry tests, 31 Vitest tests, four live-Anvil
  integration tests, and 14 applicable desktop/mobile Playwright checks with
  two intentional skips. ESLint, TypeScript, migrations, production build,
  protected scan, UAT build, and in-app browser review also passed. All 23
  pinned Robyn `tm*` mock Stock Tokens passed live chain-46630 bytecode and
  ERC-20 compatibility checks.
- 2026-07-29: Generated separate encrypted VM-only role keystores with mode 600.
  Public addresses: deployer `0xECd74AC28a1C606415f2fC11522368e6089596Ec`,
  keeper `0x9f4efb42F7d8a0E392F5030965718473E0C4F963`, attestor
  `0x449C36a9692Be235f1594658e5fB7eF429664BbD`, faucet
  `0xa8FAdDE77519C427684e82634Daf1869Cbf31455`. All balances were zero when
  checked. Keystores use lowercase Web3 `crypto` metadata and were verified
  readable by both the TypeScript service wallet loader and Foundry `cast`.
  The deployment preflight reaches and stops at the zero-balance guard.
- 2026-07-29: Revised the testnet funding plan after learning the faucet limit
  is 0.01 test ETH per day. Live chain-46630 gas price was 10,000,000 wei
  (0.01 gwei), and the comparable 11-transaction local deployment consumed
  6,490,861 gas, approximately 0.00006491 ETH at that gas price before
  network-specific overhead. Fund the deployer first and redistribute small
  keeper/UAT balances after deployment rather than funding every role directly.
- 2026-07-29: The first production-shaped core deployment from commit
  `20cc38d4bc97dc8180aca66ff50c6bee7911f855` was superseded after browser UAT
  exposed an 18-decimal seed input against the 6-decimal mock USDG.
  Addresses: manager `0x14301Aeb6845bEA2aedF43F9cD286F307EEBada7`,
  router `0xa9837E03eBAD581B5EB84F6C590C05C48df5112b`, mock USDG
  `0x17f39DAE52C1238FB50513A652cA67FF44b71F4a`, and verifier
  `0x168c3045D845C328258A507e6936f8F9022437e6`. Blockscout verified
  all four contracts. The user wallet
  `0x9099d24d55c105818b4e9ee117d87bc11063cf10` is manager/verifier
  admin and treasury; the manager holds the 50 mock-USDG seed; the faucet owns
  mock-USDG minting; and the verifier authorizer is the manager. Its manifest
  is retained only as an explicit superseded audit record.
- 2026-07-29: Added a seed-denomination safety guard and redeployed the
  corrected chain-46630 package from commit
  `f79329695ca5dffa5368dd9933e43ad2b3269543` at block `95079292`.
  Explorer-verified addresses: manager
  `0xfe0504A9eBd6f9A4FF03b1778Fd7435c536fBa0b`, router
  `0x4141D7CD735b2Fe20F9ea1E47fd139A3E23Ba10f`, mock USDG
  `0x78931e3c4729Dd0a4D3ff83D4B47558997A16721`, and verifier
  `0x03a380b412EbD6DD319A506fA725aD0C3E10C0E3`. Live reads verified the
  manager holds exactly 50,000,000 raw units (50.000000 USDG), the faucet owns
  mock USDG, the user wallet is manager admin/treasury and verifier admin, the
  manager is verifier authorizer and router operator, and the router references
  the corrected token.
- 2026-07-29: Corrected-deployment browser UAT completed through round 3 with
  two independent session wallets. Wallet A started the timer with NVDA,
  wallet B stole the bell with SPY, and wallet A reused its original allowance
  to steal it back with QQQ. The round settled at $4.2975 with QQQ winning,
  exact pools of $2.14875/$1.28925/$0.644625/$0.214875, and three indexed
  claims. The keeper prepared round 4 with no holder, no timer, and no pot.
  Browser UAT exposed and fixed a live-spectator bug that incorrectly showed
  the entry desk to a connected wallet with no prior claims. Replay projection
  was also extended with locked interval seconds, weighted points, ticker
  switch, market proof, transaction, and block details. Testnet receipts now
  use the indexed settled round instead of simulator data, and replay/receipt
  pages expose wallet-bound pull-payment withdrawal controls for final-holder
  and Closing Print rewards. Browser UAT withdrew both round-3 rewards from the
  winning wallet; live reads verified both claimed flags, a 999.438000 wallet
  balance, and exactly 0.859500 remaining in the round (0.644625 waiting to
  seed round 4 on first entry plus 0.214875 protocol pool). VM application
  gates passed 34 tests, ESLint, TypeScript, and the isolated production build.
- 2026-07-29: The initial deployment simulation found that immutable verifier
  administration prevented deployer configuration followed by user ownership.
  Added verifier admin transfer support and a regression test; 26 VM Foundry
  tests passed. The first broadcast then deployed the contracts but an
  underestimated `transferAdmin` gas limit failed after consuming its nonce.
  Recovered idempotently with explicit gas margins and verified final state.
  Testnet gas reserves after allocation: deployer about 0.0098714 ETH, keeper
  0.006 ETH, faucet 0.004 ETH; attestor remains offchain and needs no gas.

- 2026-07-12: Reset stale project-specific memory while retaining the durable memory-management logic.
- 2026-07-28: Created `docs/fomo3d-game-logic-research.md` with contract mapping, exact price curves, all payout tables, timer and round state machines, Long/Soon differences, ICO behavior, vault/mask accounting, edge cases, historical attacks, implementation pseudocode, and a fidelity test checklist.
- 2026-07-28: Created `docs/last-bell-product-concept.md` with the proposed three-minute round, control-time scoring, split payout, Stock Token entry role, mobile interface, meme language, share receipts, transaction UX, abuse boundary, and staged launch.
- 2026-07-28: Created `docs/channel-4663-ui-design.md` with the selected offbeat palette, broadcast UI grammar, typography, game states, responsive behavior, accessibility gates, and Next.js architecture.
- 2026-07-28: Created `docs/prd/README.md` plus seven linked PRDs for product scope, exact game rules/economy, experience/interface, technical product requirements, launch/risk/compliance, analytics/QA/acceptance, and delivery.
- 2026-07-28: Created `docs/design/screens/README.md`, `prompt-set.md`, `screen-contact-sheet.png`, and twelve high-fidelity portrait screen concepts covering the complete UX inventory.
- 2026-07-28: Added `docs/design/screens/desktop-live-on-air.png` and documented its responsive composition in the screen gallery and prompt set.
- 2026-07-28: Added the complete visual screen specification section to `docs/prd/03-experience-and-interface.md` and linked it from the PRD suite index.
- 2026-07-28: Created `docs/prd/08-user-stories.md`, added it to the PRD index, and made it the backlog source in the delivery plan.
- 2026-07-28: Updated PRDs 01, 02, 03, 04, 06, 07, 08, and the PRD index with the approved build kickoff, testnet-points MVP, configurable prototype constants, pnpm/CI/test stack, shared domain model, visual implementation rules, ten-fixture matrix, and three-slice implementation plan.
- 2026-07-28: Provisioned the Ubuntu KeyGame VM, expanded its root volume, installed the toolchain, transferred the project, initialized Git, authenticated GitHub CLI, created the private GitHub repository, and pushed `main`.
- 2026-07-28: Added the Next.js application foundation, full responsive Channel 4663 screen system, deterministic simulator, custom Wagmi wallet panel, and ImageGen-derived production brand/icon assets.
- 2026-07-28: Implemented `LastBellRound`, `MockUSDG`, Foundry deployment scripts, complete contract tests, and a deterministic local Anvil lifecycle.
- 2026-07-28: Wired the live UI to real devnet contract state and transactions, added testnet-ready chain/deployment configuration, and documented wallet/testnet operation.
- 2026-07-28: Added CI and completed unit, component, contract, fuzz, integration, accessibility, desktop/mobile Playwright, and in-app browser UAT.
- 2026-07-28: Closed the PRD implementation gaps and added `docs/prd/09-implementation-gap-audit.md` as the explicit handoff boundary.
- 2026-07-28: Simplified entry authorization to one reusable $100 play-USDG approval, refresh below $10, removed the max-spend UI and contract mapping, updated the PRD/visual handoff, and retained wallet-controlled revocation.
- 2026-07-29: Confined the desktop `/play/` studio to the browser viewport, removed its route-level footer, added compact-height rules for all arena states, retained the three-column studio down to 1181px, used a two-column arena/activity layout from 821px to 1180px, and added a Playwright vertical-overflow regression test.
- 2026-07-29: Replaced factions with the complete Closing Print implementation across contract, market verifier, screening APIs, shared domain, simulator, replay, wallet writes, devnet deployment, UI, PRDs, and tests. Added mobile Closing Print standings after browser acceptance exposed their absence.
- 2026-07-29: Added continuous rounds. Clean VM acceptance observed round
  4663 move through Live, Rug, Settled, an eight-second countdown, and live
  round 4664 with the exact $7.65 carry plus a $1 opening call. Browser UAT then
  observed automatic round 4665, correct dynamic round/pot display, desktop
  viewport fit, mobile no-overflow behavior, historical archives, and no
  console errors. Added `PaymentRouter`; 14 Forge tests include one approval
  across rounds and unauthorized-pull rejection, while 4 integration tests and
  24 app tests pass. The complete Playwright pass reported 14 passed and two
  intentional skips.
- 2026-07-29: Changed continuous rounds to wait for player activation. Removed
  deterministic opening callers from initial deploy and rollover, moved timer
  initialization into the first accepted claim, added waiting-state copy and
  regression coverage, and hardened devnet report freshness across Anvil time
  offsets.
- 2026-07-29: Promoted the timer above the ticker controls on the Entry Desk
  with an armed `00:45` scoreboard that remains visually distinct from the pot
  and Closing Print spread.

## Open Follow-ups

- Broadcast v4 to Robinhood testnet only after explicit user authorization.
  Testnet uses mock Stock Tokens and deterministic mock swaps labeled
  `TESTNET MOCK · NO VALUE`.
- Limit Robinhood testnet to a separately authorized two-round compatibility
  smoke test after estimating gas and preserving an operating reserve.
- Implement and audit the production canonical Stock Token swap adapter and
  its 10-minute-TWAP/1% execution-deviation enforcement before mainnet. V4
  testnet intentionally packages only the deterministic mock adapter.
- Keep Rug Zone latency evidence current and disclose FCFS automation advantage.
  Automation advantage is an accepted product property, not a freeze failure.
- Verify the source and bytecode provenance of the user's faucet TSLA, AMZN,
  PLTR, NFLX, and AMD token contracts before using them for Producer Pass.
- Add a real Reown project ID and origin allowlist, then UAT WalletConnect and browser extensions on Robinhood Chain testnet.
- Arrange independent smart-contract security and economic review.
- Move manager admin, verifier admin, and treasury to documented 2-of-3
  multisigs before a mainnet release candidate.
- Define supported jurisdictions, age/identity requirements, and obtain product counsel before a value-bearing launch.
- Select real testnet payment token, treasury, operator, and monitoring before
  deployment. RPC-provider routing is configured and verified.

## Do Not Forget

- Read `AGENTS.md` and `MEMORY.md` before making future changes in this workspace.
- Update `MEMORY.md` after durable discoveries, decisions, fixes, verification results, blocked work, and handoffs.
- Never store secrets, tokens, passwords, private keys, or sensitive personal data in `MEMORY.md`.
- Keep the verified Soon contract separate from the linked but unverified Fast contract; do not merge their logic without new evidence.
- Use the exact fixed-point Solidity formulas and rounding order from the research document for any fidelity implementation.
- Call Robinhood assets “Stock Tokens,” not wrapped shares: they provide economic exposure through tokenised debt securities and do not grant rights in the underlying equities.
- Accept only canonical Stock Token addresses from Robinhood's registry and handle inactive assets, trading halts, stale feeds, sequencer downtime, and corporate actions.
- Link implementation issues, tests, and pull requests to the requirement IDs in `docs/prd/`; update the PRD before treating changed behavior as canonical.

## Archive

- No archived entries yet.
- 2026-07-30: Implemented the devnet-first v4 qualification boundary. Added
  migration `008_v4_devnet_qualification.sql`, v4 soak commands, a durable
  devnet keeper, authenticated devnet fault scripts, Status progress, and
  read-only snapshot behavior. VM formatting, ESLint, TypeScript, 48 Vitest
  tests, and 37 Foundry tests including 512-run fuzzing passed before the
  accelerated qualification run.
