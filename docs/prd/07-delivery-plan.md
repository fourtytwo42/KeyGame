# PRD 07: Delivery Plan

Status: Stage 0 and Milestone 1 implementation approved. Later milestones remain
ordered recommendations with their existing gates. No dates or staffing
commitments are assumed.

## Delivery rule

Build evidence in increasing order of financial and external risk:

1. Prove comprehension.
2. Prove deterministic gameplay.
3. Prove onchain accounting.
4. Prove bounded authorization and live ordering.
5. Prove operations and legal readiness.
6. Add value.
7. Add Stock Token custody last.

Implementation backlog items should be derived from
[PRD 08: Comprehensive User Stories](08-user-stories.md). A story inherits the
decision status and launch gate of its traced requirement; backlog placement
does not approve an open or gated behavior.

## Milestone 0: Product baseline

Deliverables:

- PRD suite reviewed and approved as the Stage 0 baseline.
- Open decisions cataloged with the milestone they block.
- Prototype constants selected for configurable simulation.
- Acceptance tests converted into the PRD 08 user-story backlog.

Exit criteria:

- No contradiction between product, game, UX, and technical requirements.
- MVP is explicitly confirmed as local simulator followed by testnet points.

Disposition: ready to begin Milestone 1. Production economics, same-faction
theft, late entry, scoring precision, ties, account abstraction, indexing, and
value-bearing gates remain tracked but do not block the static shell.

## Milestone 1: Channel 4663 static shell

Deliverables:

- Next.js 16.2.x application.
- Strict TypeScript and linting.
- CSS token implementation.
- Selected fonts through `next/font`.
- Home, entry, arena, Rug Zone, finalizing, final, replay, receipt, rules,
  wallet/session, supported-assets, and status shells.
- Responsive and reduced-motion states.
- Component-level visual tests.

Exit criteria:

- `UX-001` through `UX-012` have static states.
- 320-pixel and desktop layouts pass.
- Five-second moderated comprehension reaches the target with static data.
- No wallet or contract integration is required yet.

## Milestone 2: Deterministic game simulator

Deliverables:

- Shared typed game state machine.
- Configurable timer, extension, Rug Zone, scoring, payout, cancellation, and settlement.
- Seeded claim-sequence scenarios.
- Replay generated from simulator events.
- Receipt generated from simulator settlement.

Exit criteria:

- Timer and pot examples match PRD 02.
- All proposed constants can be simulated without changing UI code.
- Product owner approves or revises timer and payout proposals.
- Control-time precision risk has an evidence-backed recommendation.

## Milestone 3: Testnet contracts

Deliverables:

- Minimal testnet contracts.
- Event-complete round state.
- Pull-based test rewards and refunds.
- Principal-free synthetic faction entry.
- Unit, property, invariant, and adversarial tests.
- Deployment and configuration scripts.

Exit criteria:

- `GAME-INV-*` tests pass.
- No critical or high unresolved finding.
- Anyone-can-settle and cancellation drills pass.
- Deployed rules page matches contract configuration.

## Milestone 4: Integrated testnet experience

Deliverables:

- Wallet or smart-account connection.
- Bounded session authorization.
- Sponsored test gas.
- Live subscription and direct-read fallback.
- Indexer and deterministic replay.
- Receipts and Open Graph pages.
- Analytics taxonomy.
- Status and incident states.

Exit criteria:

- All `QA-001` through `QA-012` pass.
- Canonical event ordering and replay parity are 100% in the test corpus.
- No false holder crown.
- Session budget is contract-enforced.

## Milestone 5: Limited points pilot

Deliverables:

- Invited or rate-limited player cohort.
- Moderated comprehension sessions.
- Live telemetry and support.
- Bot, latency, rejection, runback, and sharing analysis.
- Product-decision report.

Exit criteria:

- Comprehension and accuracy targets pass.
- Economic constants are revised or approved.
- Abuse and latency findings have explicit disposition.
- Stage 2 go/no-go decision is documented.

## Milestone 6: Sponsor-funded USDG

Preconditions:

- Stage 2 gates in PRD 05.
- Independent audit.
- Treasury and operations readiness.
- Jurisdiction and eligibility decision.

Deliverables:

- USDG prize accounting.
- Sponsor seed workflow.
- Production monitoring.
- Mainnet rules and support.
- Value-bearing incident plan.

Exit criteria:

- Value-bearing acceptance in PRD 06.
- Reconciliation proves every pot allocation and claim.
- Counsel and owner approvals are recorded.

## Milestone 7: Eligible Stock Token mode

Preconditions:

- Written Stock Token eligibility and custody design.
- Canonical registry and price-feed integration.
- Updated audit.
- Asset-status and emergency runbooks.

Deliverables:

- Canonical Stock Token faction entry.
- Minimum-value validation.
- Principal vault accounting and withdrawal.
- Inactive, halted, stale-feed, and corporate-action handling.
- Eligibility enforcement.

Exit criteria:

- Every Stage 3 gate in PRD 05 passes.
- Principal recovery succeeds under all supported failure tests.
- Public language accurately describes tokenised debt securities.

## Workstreams

| Workstream | Responsibility |
|---|---|
| Product | Rule decisions, scope, user research, success metrics, acceptance |
| Design | Channel 4663 system, interaction, responsive, receipt, accessibility |
| Frontend | Next.js routes, arena, wallet/session UX, replay, receipts |
| Smart contracts | Round, accounting, settlement, events, tests |
| Data | Indexer, reconciliation, analytics, replay projection |
| Security | Threat model, reviews, fuzzing, incident design, audit coordination |
| Legal/compliance | Classification, jurisdictions, eligibility, disclosures, terms |
| Operations | Treasury, monitoring, status, support, incident response |

One person may own multiple workstreams, but every release gate needs a named owner.

## Decision queue

Resolve in this order:

| Order | Decision | Status | Blocks |
|---:|---|---|---|
| 1 | Confirm MVP as static simulator plus testnet points. | `DECIDED` | Nothing; implementation may begin. |
| 2 | Confirm same-faction bell theft and late entry. | `OPEN`, configurable in simulator | Simulator recommendation and testnet rules. |
| 3 | Select timestamp, block, or hybrid control scoring. | `OPEN`, strategy-injected in simulator | Contract model. |
| 4 | Approve or revise timer constants. | `SELECTED FOR PROTOTYPE` | Production/testnet contract finalization after simulation. |
| 5 | Approve or revise 50/30/15/5 payout. | `SELECTED FOR PROTOTYPE` | Value-bearing economic and contract model. |
| 6 | Select account abstraction and session implementation. | `OPEN` | Integrated testnet. |
| 7 | Select gas sponsorship and indexer approach. | `OPEN` | Integrated testnet. |
| 8 | Decide Stage 2 jurisdictions and product classification. | `GATE` | Sponsor-funded value. |
| 9 | Decide Stock Token entry and eligibility model. | `GATE` | Stage 3. |

## Approved initial build slice

### Slice A: Foundation

| ID | Deliverable |
|---|---|
| `DEL-BOOT-001` | Initialize Git and scaffold Next.js with pnpm, strict TypeScript, linting, formatting, validated environment configuration, and CI. |
| `DEL-BOOT-002` | Implement the Dead Channel tokens, font loading, focus treatment, responsive arena widths, clipped fields, and broadcast primitives. |
| `DEL-BOOT-003` | Define `RoundConfig`, `RoundState`, `Faction`, `ClaimEvent`, `SessionBudget`, `Settlement`, `Receipt`, `IncidentState`, `CancellationState`, and `SimulationScenario`. |
| `DEL-BOOT-004` | Commit `QA-FIX-001` through `QA-FIX-010` as typed deterministic fixture contracts before screen-specific state logic. |

### Slice B: Complete static experience

| ID | Deliverable |
|---|---|
| `DEL-SHELL-001` | Implement Home and wallet-free spectator routing. |
| `DEL-SHELL-002` | Implement Entry / Off Air with faction and budget fixture states. |
| `DEL-SHELL-003` | Implement Live / On Air, submitted, accepted, rejected, rugged, and budget states. |
| `DEL-SHELL-004` | Implement Rug Zone, Finalizing, and Final Transmission. |
| `DEL-SHELL-005` | Implement Replay and deterministic Receipt surfaces. |
| `DEL-SHELL-006` | Implement Rules, Wallet / Session, Supported Assets, Weak Signal, and Dead Air. |
| `DEL-SHELL-007` | Implement the narrow mobile, tablet-rail, and desktop three-zone compositions plus reduced motion. |

### Slice C: Evidence

| ID | Deliverable |
|---|---|
| `DEL-EVID-001` | Add unit and component tests for typed state-to-view mapping and every transaction or incident state. |
| `DEL-EVID-002` | Add Playwright keyboard, accessibility, E2E smoke, and screenshot coverage at the PRD 06 viewport matrix. |
| `DEL-EVID-003` | Run the five-question comprehension protocol against the static shell and record failures by question. |
| `DEL-EVID-004` | Reconcile implementation against PRD 08 P0 Stage 0 stories before Milestone 1 exit. |

## Initial implementation backlog

### P0

- Scaffold Next.js with selected architecture.
- Implement Dead Channel tokens and typography.
- Implement static Off Air, On Air, Rug Zone, Final, Replay, Receipt, Rules, and Dead Air states.
- Create typed round-configuration schema.
- Create pure game state machine and seeded simulator.
- Implement five-second comprehension test prototype.
- Convert `GAME-INV-*` requirements into test placeholders.
- Establish CI for typecheck, lint, unit tests, accessibility, and visual regression.

### P1

- Wallet-free spectator routing.
- Replay stepper.
- Open Graph receipt rendering.
- Session-budget UI.
- Sound and haptic preference framework.
- Status and Weak Signal states.
- Test analytics adapter with privacy boundary.

### P2

- Live wallet integration.
- Testnet contract deployment.
- Event indexer.
- Account abstraction and sponsored gas.
- Canonical replay verification.

No mainnet or Stock Token custody item belongs in the initial scaffold backlog.

## Definition of done

A feature is done when:

- Requirement IDs are linked.
- Product behavior and error behavior are implemented.
- Unit and integration tests cover the requirement.
- Accessibility is verified.
- Mobile and desktop states are visually checked.
- Analytics are included or explicitly not applicable.
- Public rules and copy match behavior.
- No secret or environment-specific address is hard-coded.
- Relevant PRD and memory are updated if a decision changed.

## Handoff package for each milestone

- Delivered files and deployed versions.
- Requirements completed.
- Test and verification evidence.
- Known issues and accepted risks.
- Open decisions.
- Exact next step.

## Immediate next action

Product-owner review has approved the kickoff baseline. Begin Slice A with
`DEL-BOOT-001`: initialize the repository and scaffold the Next.js application,
then implement the typed domain model and fixture contracts before stateful
screen work.
