# Project Memory

Durable project context lives here. Update this file whenever information should survive chat context compression or future agent handoff.

## Active Handoff

- Current task: Reusable play-USDG allowance simplification is implemented and verified.
- Last meaningful result: Entry now asks only for a faction and one reusable $100 play-USDG approval; a claim refreshes the approval to $100 only when the current allowance is below $10. The max-spend picker and contract-level session ceiling were removed, while wallet revocation remains available.
- Next step: Add real testnet environment ownership and WalletConnect configuration only when the user authorizes Robinhood Chain testnet deployment.
- Blockers: None documented.

## Current State

- The repository now contains a pnpm Next.js 16.2.12 application with React 19, Wagmi 3, Viem, React Query, Vitest, Playwright, and axe tooling.
- The complete responsive application, Foundry contracts, deterministic Anvil controller, CI, and testnet deployment workflow are implemented.
- The canonical entry authorization is a reusable $100 play-USDG allowance. Each accepted bell claim transfers exactly $1, the client requests a new $100 approval only below $10, and users can edit, reject, or revoke the ERC-20 allowance in their wallet.
- `docs/prd/09-implementation-gap-audit.md` records implemented gaps, intentional product gates, and external launch prerequisites.
- Local devnet is running on the VM at `http://192.168.50.138:3000`; Anvil chain ID `31337` is exposed at port `8545`. Last verified 2026-07-28.
- Deterministic local addresses are recorded in `deployments/31337.json`; the deployment script recreates a fresh funded round without storing private keys.
- The authoritative build workspace is VM `192.168.50.138`, user `hendo420`, path `/home/hendo420/projects/KeyGame`.
- The VM repository uses branch `main`, tracks `origin/main`, and pushes to the private GitHub repository `https://github.com/fourtytwo42/KeyGame`.
- `docs/fomo3d-game-logic-research.md` is the current technical baseline for original FoMo3D rules, formulas, accounting, timing, edge cases, and historical attacks.
- `docs/last-bell-product-concept.md` is the current proposed modern product synthesis, including the round state machine, payout model, mobile screen, meme vocabulary, Stock Token role, share loop, and staged launch.
- `docs/channel-4663-ui-design.md` is the selected palette, UI grammar, typography, motion, mascot, accessibility, responsive, and Next.js frontend direction.
- `docs/prd/README.md` indexes the implementation-facing PRD suite and is the requirements entrypoint.
- `docs/prd/08-user-stories.md` is the implementation backlog source for spectator, player, operator, support, audit, accessibility, compliance, and measurement stories.
- `docs/design/screens/README.md` is the visual handoff for all twelve planned app screens; `screen-contact-sheet.png` is the at-a-glance review artifact and `prompt-set.md` records the ImageGen direction.
- `docs/design/screens/desktop-live-on-air.png` is the desktop layout reference: a narrow center arena, rules and airtime on the left rail, and Trenches plus session controls on the right rail.
- Robinhood Chain is the intended target for a modern reinterpretation. The working concept is a proposal, not an approved architecture.

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
- `contracts/LastBellRound.sol` implements the prototype state machine and pull-payment settlement. `contracts/mocks/MockUSDG.sol` is devnet-only.
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
- Consolidated round proposal, not yet approved: lock a minimum canonical Stock Token value to choose a four-ticker faction; open with 45 seconds; charge a fixed $1 USDG per accepted bell claim; add two seconds per normal-phase claim up to a three-minute hard end; make the last ten seconds a non-extendable `RUG ZONE`; score faction and player control by accepted onchain time; and return the same locked token amount after settlement.
- Consolidated payout proposal, not yet approved: 50% to the final bell holder as the obvious headline winner, 30% to the control-winning faction split by personal bell-control time, 15% to seed the next round, and 5% to protocol operations. Locked Stock Tokens are kept separate from the prize pot.
- Comprehension rule approved by user feedback: every first-time surface should reduce the game to `Pick a bag`, `Pay $1 to steal the bell`, and `Hold it at zero to win 50%`. Pair meme language with literal explanations, keep the primary action visibly priced at $1, show the current allowance and estimated calls, and reduce entry to a faction choice plus one reusable approval.
- Selected visual direction: `Channel 4663`, a fictional late-night public-access market game show named for Robinhood Chain ID 4663. Use broadcast identifiers, teletext-density score strips, a studio-switch action, transmission receipts, square/clipped color slabs, awkward three-color mascots, and the `Dead Channel` palette. Avoid dark-green fintech, neon cyberpunk, glassmorphism, neo-brutalism, casino/gacha polish, generic shadcn dashboards, gradients, glows, card stacks, and corporate ticker branding.
- Selected frontend direction: Next.js 16.2.x App Router with strict TypeScript, React Server Components by default, narrowly scoped Client Components for the live arena, CSS Modules plus global tokens, `next/font`, native CSS/Web Animations, and `viem`. Do not use Tailwind, shadcn/ui, a dashboard template, or Framer Motion as the default implementation.
- Approved MVP baseline: build the Next.js Channel 4663 static shell and deterministic simulator first, followed by Robinhood Chain testnet points with synthetic factions, sponsored test gas, and faucet-issued or non-transferable test units. Player-funded prizes and Stock Token custody remain excluded.
- Approved prototype constants: four factions, a one-USD-equivalent test action, 45-second initial deadline, two-second normal extension, 180-second hard end, final-ten-second Rug Zone, final-two-second snipe label, and 50/30/15/5 illustrative settlement. These remain configurable and are not production economic approval.
- Approved engineering bootstrap: Git, pnpm, pinned compatible active-LTS Node metadata, strict TypeScript, ESLint, Prettier, typed environment validation, Vitest plus React Testing Library, Playwright, axe-core, screenshot regression, and blocking CI checks.
- Approved implementation order: shared typed domain model and ten deterministic fixture scenarios before stateful screen logic; then the complete static Home through Dead Air screen slice across mobile, desktop, keyboard, and reduced-motion states.
- Same-faction theft, late entry, control-time precision, and faction tie-breaking remain configurable/open until simulation evidence supports a decision.
- PRD status discipline: `DECIDED` requirements may guide implementation; `SELECTED FOR PROTOTYPE`, `PROPOSED`, `OPEN`, and `GATE` items retain their labeled uncertainty and cannot be silently promoted to production decisions.

## Verification Ledger

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

- Entry asks the player to choose a faction and approve $100 of play USDG; there is no max-spend picker.
- Each successful bell claim still transfers exactly $1.
- Before a claim, the client requests a fresh $100 approval only when the existing allowance is below $10.
- ERC-20 allowance and balance are the onchain spend constraints. The player may edit or reject the approval in the wallet and may revoke it from the app or wallet.

## Known Issues

- Real Stock Token custody, player-funded prizes, account abstraction/gas sponsorship, and production compliance remain intentional PRD gates, not missing Stage 1 implementation.
- Wallet connectors are implemented but intentionally not extension-tested in this devnet-only goal. WalletConnect requires a real Reown project ID and origin allowlist.
- Robinhood Chain testnet deployment is ready but was not performed; it requires funded signer configuration, real token/treasury addresses, and explicit launch authorization.
- GitHub Actions reports non-blocking warnings that some third-party action versions target Node.js 20 while the runner forces Node.js 24. All jobs pass.
- The production build emits non-blocking fallback-metric warnings for Atkinson Hyperlegible Next and Big Shoulders Stencil.
- Contracts have extensive local tests but no independent security audit.
- Original FoMo3D includes predictable airdrop randomness, block-stuffing exposure, contract-wallet exclusions, external-call dependencies, integer-boundary quirks, and several documented accounting/view defects.
- Any real-money implementation would require security and current legal/regulatory review.
- Robinhood Stock Tokens are unavailable to U.S. persons and restricted in other jurisdictions. A permissionless contract plus frontend geo-block is not automatically a sufficient compliance design.
- First-come/first-served sequencing reduces gas-price queue jumping but does not eliminate latency advantages, Sybil activity, sequencer censorship risk, or automated play.

## Completed Work

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

## Open Follow-ups

- Add a real Reown project ID and origin allowlist, then UAT WalletConnect and browser extensions on Robinhood Chain testnet.
- Arrange independent smart-contract security and economic review.
- Define supported jurisdictions, age/identity requirements, and obtain product counsel before a value-bearing launch.
- Select real testnet payment token, treasury, operator, monitoring, and RPC-provider configuration before deployment.

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
