# PRD 06: Analytics, QA, and Acceptance

Status: Measurement, deterministic fixture, and verification baseline approved
for MVP-0 and MVP-1.

## Measurement principle

The product should optimize for understood, completed, replayable rounds, not raw wallet count, TVL, or player spend.

## North-star metric

**Understood completed rounds per active participant**

A round counts when:

- The participant entered or made at least one valid test action.
- The round reached settlement or cancellation.
- The client received the canonical final state.
- The participant was not identified as internal test automation.

Comprehension is measured separately through moderated and in-product research; analytics alone cannot prove understanding.

## Product metrics

| ID | Metric | Definition | MVP target |
|---|---|---|---:|
| `DATA-001` | Five-second comprehension | Testers answering action, cost, win, budget, and holder questions correctly | ≥85% |
| `DATA-002` | Entry completion | Started bounded authorization resulting in confirmed round entry | ≥75% |
| `DATA-003` | Accepted-state accuracy | Accepted UI holder transitions matching canonical order | 100% |
| `DATA-004` | Budget comprehension | Testers who correctly state remaining maximum spend | ≥90% |
| `DATA-005` | Round completion visibility | Active participants receiving final canonical state | ≥98% |
| `DATA-006` | Replay parity | Replays matching contract settlement and event order | 100% |
| `DATA-007` | Immediate runback | Settled-round participants entering or spectating the next round | Hypothesis: ≥25% |
| `DATA-008` | Receipt share initiation | Settled participants opening a native share or copy-link action | Hypothesis: ≥8% |
| `DATA-009` | Shared-link conversion | Unique receipt visitors who spectate or enter a later round | Measure, no gate |
| `DATA-010` | Rejected-action clarity | Testers who correctly say whether the $1 game fee was charged | ≥90% |
| `DATA-011` | Accessibility completion | Keyboard-only test users completing the core journey | 100% in test set |
| `DATA-012` | Index discrepancy | Derived state mismatches against direct contract state | 0 unresolved |

Hypothesis metrics do not block testnet release. Accuracy and comprehension metrics do.

## Event taxonomy

Analytics names are distinct from contract events.

| ID | Event | Minimum properties |
|---|---|---|
| `DATA-EVT-001` | `round_viewed` | round ID, phase, referrer class, spectator/connected |
| `DATA-EVT-002` | `rules_expanded` | round ID, source surface |
| `DATA-EVT-003` | `faction_selected` | round ID, faction |
| `DATA-EVT-004` | `budget_selected` | round ID, amount, actions available |
| `DATA-EVT-005` | `entry_started` | round ID, entry mode |
| `DATA-EVT-006` | `entry_confirmed` | round ID, faction, elapsed time |
| `DATA-EVT-007` | `claim_pressed` | round ID, faction, phase, remaining budget |
| `DATA-EVT-008` | `claim_submitted` | round ID, local action ID |
| `DATA-EVT-009` | `claim_accepted_observed` | round ID, transaction hash, log index, observation latency |
| `DATA-EVT-010` | `claim_rejected` | round ID, reason class, game fee charged boolean |
| `DATA-EVT-011` | `player_rugged` | round ID, previous faction, new faction, remaining time |
| `DATA-EVT-012` | `rug_zone_observed` | round ID, remaining time, index lag |
| `DATA-EVT-013` | `round_final_observed` | round ID, final holder, winning faction, observation latency |
| `DATA-EVT-014` | `reward_claim_started` | round ID, reward type |
| `DATA-EVT-015` | `reward_claim_observed` | round ID, reward type, amount |
| `DATA-EVT-016` | `receipt_opened` | round ID, result type |
| `DATA-EVT-017` | `receipt_shared` | round ID, result type, share method |
| `DATA-EVT-018` | `replay_opened` | round ID, source |
| `DATA-EVT-019` | `replay_completed` | round ID, claim count |
| `DATA-EVT-020` | `session_revoked` | round ID, remaining budget |
| `DATA-EVT-021` | `weak_signal_shown` | round ID, lag, dependency |

## Analytics privacy

| ID | Requirement |
|---|---|
| `DATA-020` | Do not collect private keys, session secrets, signatures, identity documents, or full wallet provider payloads. |
| `DATA-021` | Wallet addresses are pseudonymous identifiers and must be treated as potentially personal data. |
| `DATA-022` | Do not send sensitive eligibility results to general product analytics. |
| `DATA-023` | Separate security and compliance logs from product analytics. |
| `DATA-024` | Retention, deletion, consent, and access controls follow the launch jurisdiction and privacy policy. |
| `DATA-025` | Analytics failure cannot block play, settlement, withdrawal, or replay verification. |

## Experiment policy

Permitted in simulator or testnet:

- $0, $0.50-equivalent points, $1-equivalent points, and $2-equivalent points between separate rounds.
- 45- versus 60-second opening timer.
- Three versus four ticker factions.
- Faction-bonus presentation.
- Receipt phrase and layout.
- Entry budget presets.

Prohibited:

- Changing fee, timer, or payout during a live round.
- Hiding price or spend to improve conversion.
- Showing different canonical state to different cohorts.
- Value-bearing economic tests before the related gates.

The selected prototype remains $1. An experiment requires a published round configuration and separate analysis.

## QA layers

### Deterministic fixture matrix

The Stage 0 shell and simulator use committed deterministic scenarios. Each
scenario includes typed configuration, ordered inputs, expected intermediate
states, expected replay, and expected final receipt.

| ID | Scenario | Required evidence |
|---|---|---|
| `QA-FIX-001` | Normal final-holder win | Entry, accepted claims, ordinary extensions, zero, finalization, settlement, reward, replay, and receipt agree. |
| `QA-FIX-002` | Rug Zone snipe | Final-seconds holder changes without extending the effective end; receipt records the accepted remaining time. |
| `QA-FIX-003` | Rapid competing claims | Canonical order is stable, no optimistic holder appears, and configured control-time precision is explicit. |
| `QA-FIX-004` | Rejected current-holder claim | Self-extension is rejected and the game fee remains uncharged. |
| `QA-FIX-005` | Session budget exhausted | The last affordable action is accepted, the next is blocked, and no silent top-up occurs. |
| `QA-FIX-006` | Weak Signal and recovery | Freshness degrades, unsafe claims pause, direct or simulated fallback recovers, and no false crown appears. |
| `QA-FIX-007` | Settlement pending | Zero freezes, claims close, last observed holder remains nonfinal, and another actor can settle. |
| `QA-FIX-008` | Cancelled round | No winner exists; fee refunds and principal recovery remain independent and replayable. |
| `QA-FIX-009` | Faction tie | The selected tie strategy produces one deterministic result and alternative strategies can be simulated without UI changes. |
| `QA-FIX-010` | Empty round | The configured seed and empty-round strategy settle or advance deterministically without inventing a holder. |

Fixture identifiers are stable and may be selected through development-only
routes or controls. Production bundles must not expose a fixture control that
can replace canonical live state.

### Product-rule unit tests

- Timer formula.
- Rug Zone persistence.
- Payout allocation.
- Tie-breakers.
- Control intervals.
- Copy-state mapping.
- Budget calculation.

### Contract unit tests

- Entry validation.
- Faction immutability.
- Claim fee.
- Self-extension rejection.
- Per-wallet block rate.
- Deadline extension and hard cap.
- Settlement.
- Principal, reward, refund, and operations claims.

### Property and invariant tests

Implement every `GAME-INV-*` requirement as an automated invariant where feasible.

Additional properties:

- Any sequence of valid claims ends no later than the hard end.
- Sum of allocated USDG never exceeds accounted USDG.
- No successful withdrawal can be repeated.
- A malicious recipient cannot block settlement or other withdrawals.
- Cancellation cannot create both a winner reward and fee refund.
- Future-round configuration cannot mutate an existing round.

### Integration tests

- Wallet authorization to accepted entry.
- One-tap claim through event observation.
- RPC and indexer reconciliation.
- Direct-read fallback.
- Sponsor/paymaster failure.
- Stale-feed entry pause.
- Asset inactive after deposit.
- Settlement and independent withdrawals.
- Open Graph receipt rendering.

### End-to-end tests

Required journeys:

1. Spectate without wallet.
2. Enter, claim, get rugged, and run it back.
3. Hold at zero and claim final-holder reward.
4. Win faction pool without final bell.
5. Receive both final and faction rewards.
6. Submit too late and see no game-fee charge.
7. Exhaust session budget.
8. Revoke session.
9. Observe Weak Signal and recover.
10. Cancel a test round and claim refund.

### Visual regression

Test at:

- 320 by 568.
- 360 by 800.
- 390 by 844.
- 768 by 1024.
- 1366 by 768.
- 1440 by 900.

Capture:

- Off Air.
- On Air.
- Submitted.
- Accepted.
- Rugged.
- Rug Zone.
- Finalizing.
- Final transmission.
- Weak Signal.
- Dead Air.

### Accessibility testing

- Automated axe checks.
- Keyboard-only flow.
- Screen-reader flow on at least one Windows and one mobile combination before public launch.
- 200% zoom.
- Reduced motion.
- High contrast or forced colors.
- Sound off.
- Rapid-event announcement load.

### Load and adversarial tests

- Burst claims from many wallets near Rug Zone.
- Multiple claims in the same block.
- Same-faction claim competition.
- RPC delivery out of order.
- Duplicate logs.
- Reorg or replaced block handling.
- Delayed settlement.
- Reentrant and reverting receivers.
- Malicious token rejected by allowlist.
- Indexer restart and full rebuild.
- Frontend operating with indexer unavailable.

## Testnet release acceptance

All P0 requirements must pass:

| ID | Acceptance |
|---|---|
| `QA-001` | All game and accounting invariants pass the configured fuzz campaign. |
| `QA-002` | No critical or high unresolved security finding. |
| `QA-003` | Canonical accepted ordering and replay parity are 100% in the test corpus. |
| `QA-004` | No false holder crown appears in E2E tests. |
| `QA-005` | Contract-enforced session spend never exceeds the selected budget. |
| `QA-006` | Rejected claims do not charge the game fee. |
| `QA-007` | Round cannot exceed hard end. |
| `QA-008` | Principal or test eligibility is recoverable after settlement and cancellation. |
| `QA-009` | 320-pixel arena has no horizontal overflow. |
| `QA-010` | Keyboard and reduced-motion core flows pass. |
| `QA-011` | Public rules match deployed testnet configuration. |
| `QA-012` | Incident and cancellation drill is completed. |

## Value-bearing release acceptance

In addition to testnet acceptance:

- Product counsel and jurisdiction gates pass.
- Independent audit is complete.
- Economic simulation is approved.
- Mainnet addresses and source verification are confirmed.
- Treasury reconciliation is proven.
- Monitoring and incident staffing are active.
- Session authorization receives independent security review.
- Asset, feed, sequencer, and eligibility failure tests pass.

## Verification artifacts

Every release candidate should retain:

- Contract test report.
- Fuzz and invariant configuration plus seeds for failures.
- E2E report.
- Accessibility report.
- Visual-regression report.
- Load-test report.
- Deployed address and bytecode manifest.
- Public configuration snapshot.
- Risk and approval record.
- Known limitations.
