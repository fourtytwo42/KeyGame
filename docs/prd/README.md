# Last Bell PRD Suite

> `D-020` (2026-07-29): Closing Print is the implemented product.
> [10-closing-print-market-reactive.md](./10-closing-print-market-reactive.md)
> supersedes every permanent-faction, asset-lock, separate-entry, and
> `joinFaction` requirement elsewhere in this suite. Older faction passages
> are decision history, not acceptance criteria.

Current implementation documents:

- [PRD 10: Closing Print market-reactive specification](./10-closing-print-market-reactive.md)
- [PRD 11: Closing Print user stories](./11-closing-print-user-stories.md)
- [PRD 12: Robinhood testnet production readiness](./12-robinhood-testnet-production-readiness.md)
- [PRD 13: DEX-powered Onchain Momentum](./13-dex-onchain-momentum.md)
- [PRD 14: Product, retention, and mainnet readiness](./14-product-retention-mainnet-readiness.md)
- [PRD 15: Audit candidate, Airtime Pool, and mainnet readiness](./15-audit-candidate-airtime-pool.md)

Status: Product baseline approved for Stage 0 implementation and a testnet-points
first public MVP. Value-bearing and Stock Token stages remain gated.

This directory turns the historical FoMo3D research, Last Bell product concept, Channel 4663 visual direction, and Robinhood Chain constraints into implementation-facing requirements.

The suite deliberately separates selected decisions from proposals and launch gates. A requirement marked `PROPOSED`, `OPEN`, or `GATE` must not be silently treated as approved production behavior.

The complete mobile and desktop concept set is embedded in
[03 Experience and Interface](03-experience-and-interface.md#visual-screen-specifications).

![Last Bell visual screen set](../design/screens/screen-contact-sheet.png)

## Document map

| Document | Purpose | Primary requirement prefix |
|---|---|---|
| [01 Product Requirements](01-product-requirements.md) | Product vision, users, goals, scope, principles, and top-level requirements | `PRD` |
| [02 Game Rules and Economy](02-game-rules-and-economy.md) | Exact round state machine, timer, actions, scoring, pot accounting, settlement, and invariants | `GAME` |
| [03 Experience and Interface](03-experience-and-interface.md) | User journeys, screen requirements, Channel 4663 behavior, transaction feedback, copy, accessibility, and receipts | `UX` |
| [04 Technical Product Requirements](04-technical-product-requirements.md) | Next.js frontend, contracts, smart-account sessions, indexing, events, data ownership, performance, and security boundaries | `TECH` |
| [05 Launch, Risk, and Compliance](05-launch-risk-and-compliance.md) | Staged launch, legal and operational gates, threat areas, admin boundaries, and incident requirements | `RISK` |
| [06 Analytics, QA, and Acceptance](06-analytics-qa-and-acceptance.md) | Success metrics, telemetry, experiments, testing layers, invariants, UAT, and release acceptance | `DATA`, `QA` |
| [07 Delivery Plan](07-delivery-plan.md) | Milestones, dependencies, ownership, decision gates, prioritized backlog, and definitions of done | `DEL` |
| [08 Comprehensive User Stories](08-user-stories.md) | Traceable stories and acceptance criteria for spectators, players, operators, support, auditors, accessibility, compliance, and product learning | `US` |
| [09 Implementation Gap Audit](09-implementation-gap-audit.md) | Reconciliation of requirements against the working application, deliberate gates, and external prerequisites | `AUDIT` |
| [12 Robinhood Testnet Production Readiness](12-robinhood-testnet-production-readiness.md) | Production-shaped testnet architecture, evidence, external blockers, and freeze gates | `TESTNET` |
| [14 Product, Retention, and Mainnet Readiness](14-product-retention-mainnet-readiness.md) | Reward projections, SIWE profiles, featured raids, deployment-safe history, and audit-candidate gates | `RET`, `IDENT` |
| [15 Audit Candidate and Airtime Pool](15-audit-candidate-airtime-pool.md) | Nonfinancial Crown, all-caller raw-time Airtime Pool, FCFS disclosure, Safes, soak, and freeze gates | `AUDIT`, `AIRTIME` |

## Status vocabulary

| Status | Meaning |
|---|---|
| `DECIDED` | User direction or durable project decision; implementation may rely on it. |
| `SELECTED FOR PROTOTYPE` | Use in prototypes and testnet while collecting evidence; not automatically a production commitment. |
| `PROPOSED` | Recommended starting design that still needs product-owner approval. |
| `OPEN` | A material product or technical choice remains unresolved. |
| `GATE` | External approval or verification is required before the related stage can launch. |
| `OUT` | Explicitly excluded from the current product. |

## Decision ledger

| ID | Decision | Status | Notes |
|---|---|---|---|
| `D-001` | Product is `Last Bell`; primary mode is `Ticker Royale`. | `DECIDED` | Channel 4663 is the visual world, not the product name. |
| `D-002` | Target Robinhood Chain, chain ID `4663`. | `DECIDED` | External chain facts were last verified 2026-07-28. |
| `D-003` | Main action copy is `SEND IT FOR THE BELL · $1`; `ape` remains supporting meme vocabulary. | `SELECTED FOR PROTOTYPE` | Stage 0 and Stage 1 use a test unit mirroring one USD; actual USDG is later gated scope. |
| `D-004` | Final holder receives 50%; control-winning faction receives 30%; 15% seeds the next round; 5% funds operations. | `SELECTED FOR PROTOTYPE` | Use for fixtures and simulation; production still requires economic validation and approval. |
| `D-005` | Four ticker factions per round. | `SELECTED FOR PROTOTYPE` | Use four synthetic factions in Stage 0 and Stage 1; later ticker rosters remain configurable. |
| `D-006` | Stock Token principal is separate from the prize pot and the same token amount becomes withdrawable after settlement. | `PROPOSED` | Value can still change while locked. |
| `D-007` | Launch with testnet points before value-bearing play. | `DECIDED` | The first public MVP is Robinhood Chain testnet points with no player-funded prize or Stock Token custody. |
| `D-008` | Use the Channel 4663 visual system and Dead Channel palette. | `DECIDED` | See `docs/channel-4663-ui-design.md`. |
| `D-009` | Use Next.js 16.2.x App Router, strict TypeScript, CSS Modules, `next/font`, and narrowly scoped Client Components. | `DECIDED` | No Tailwind, shadcn/ui, or dashboard template by default. |
| `D-010` | Exclude a native token, ICO, affiliate tree, random airdrop, key curve, holder dividends, and unlimited overtime. | `DECIDED` | Historical FoMo3D mechanics remain research only. |
| `D-011` | Actual Stock Token locking and value-bearing play require jurisdiction, eligibility, security, and product-counsel gates. | `GATE` | Frontend geo-blocking alone is not assumed sufficient. |
| `D-012` | Clock and control-time precision require simulation before the payout model is production-final. | `OPEN` | Second-level EVM timestamps may produce zero-duration rapid holds. |
| `D-013` | Approval UX uses a reusable $100 play-USDG allowance and requests refresh only below $10. | `DECIDED` | The player may reject, change, or revoke approval; account abstraction and gas sponsorship remain open. |
| `D-014` | Begin with MVP-0 and Milestone 1: a static Channel 4663 shell against typed deterministic fixtures. | `DECIDED` | Wallet, contract, indexer, USDG, and Stock Token custody work are excluded from the initial scaffold. |
| `D-015` | Use the current `GAME-CFG-*` timer and payout values as configurable simulation defaults. | `SELECTED FOR PROTOTYPE` | Prototype selection does not approve production economics. |
| `D-016` | Keep same-faction theft, late entry, control-time precision, and faction tie-breaking configurable until simulation produces evidence. | `DECIDED` | Components consume typed configuration and cannot hard-code an unresolved outcome. |
| `D-020` | Replace permanent factions with a ticker selected on every paid claim and market-weight the 30% Closing Print contest. | `IMPLEMENTED STAGE 1` | Use `closing-print-v1`; no separate entry transaction or Stock Token custody. |
| `D-022` | Replace Chainlink scoring with direct ten-minute Uniswap V3 Stock Token/USDG TWAPs; weighted points pick the ticker and raw airtime divides its pool. | `IMPLEMENTED / ECONOMIC REVIEW GATED` | PRD 13 overrides conflicting price-source and contributor-share requirements. |
| `D-023` | Add estimated reward clarity, opt-in SIWE caller profiles, and community-triggered featured raids without changing contract economics. | `IMPLEMENTED / MAINNET GATED` | PRD 14 defines deployment-aware history and the remaining audit-candidate gates. |
| `D-024` | Make DEX momentum nonfinancial and award the 30% Airtime Pool to all callers by total raw control time. | `IMPLEMENTED CANDIDATE / SOAK OPEN` | PRD 15 supersedes all current-version payout language in PRDs 01-14. |
| `D-017` | Bootstrap with Git, pnpm, pinned runtime metadata, and strict VM-local checks before feature branches expand. | `DECIDED` | GitHub Actions is disabled; see PRD 04 engineering bootstrap. |
| `D-018` | Define the typed game-domain model and deterministic fixture matrix before stateful screen implementation. | `DECIDED` | Fixtures cover normal, late, rejected, degraded, settlement, cancellation, tie, and empty-round paths. |
| `D-019` | Implement the full static screen slice before wallet or contract integration. | `DECIDED` | Home, Entry, Live, Rug Zone, Finalizing, Final, Replay, Receipt, Rules, Wallet/Session, Supported Assets, and Dead Air at mobile and desktop breakpoints. |

## Baseline sources

Use these sources in this order:

1. Current application and contract files once implementation exists.
2. This PRD suite.
3. [Last Bell Product Concept](../last-bell-product-concept.md).
4. [Channel 4663 UI Design](../channel-4663-ui-design.md).
5. [FoMo3D Game Logic Research](../fomo3d-game-logic-research.md).
6. `MEMORY.md`.

The original FoMo3D research is authoritative only for historical behavior. It is not the specification for Last Bell.

## Approved MVP scope

`MVP` means:

- Next.js Channel 4663 experience.
- Robinhood Chain testnet.
- Synthetic ticker factions.
- Points or non-transferable test rewards.
- A non-transferable or faucet-issued test unit mirroring the $1 action without real player value.
- Sponsored test gas.
- No Stock Token custody.
- No player-funded prize.
- Deterministic round replay and receipts.

Sponsor-funded USDG and canonical Stock Token entry are later gated stages.

## Traceability rule

Implementation issues, tests, pull requests, and release notes should cite the relevant requirement IDs. If implementation requires changing a requirement, update the PRD and decision ledger before treating the changed behavior as canonical.

## Application scaffolding approval

Application scaffolding is approved using the decided visual, frontend,
bootstrap, and typed-fixture architecture. The following do not block the
static shell or deterministic simulator:

- Final production payout percentages.
- Actual Stock Token custody.
- Mainnet prize funding.
- Jurisdiction implementation.

They do block a value-bearing mainnet release.
