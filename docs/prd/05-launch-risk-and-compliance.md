# PRD 05: Launch, Risk, and Compliance

> `D-020` override: Stock Tokens are never deposited or locked. Producer Pass
> is a binary balance check, and production remains gated as specified in
> [PRD 10](./10-closing-print-market-reactive.md).

Status: Risk framework and launch gates. This is a product requirement, not legal advice.

## Launch principle

No value-bearing stage launches merely because the software works.

Each stage requires the product, technical, security, legal, eligibility, operational, and economic gates appropriate to that stage.

## Staged launch

### Stage 0: Local simulator

Value: none.

Scope:

- Next.js Channel 4663 shell.
- Deterministic round simulator.
- Synthetic wallets and ticker factions.
- Receipt and replay generation.

Exit gates:

- Five-second comprehension test.
- Responsive and accessibility acceptance.
- Timer and payout simulations.
- No unresolved P0 product contradiction.

### Stage 1: Robinhood Chain testnet points

Value: non-transferable test points only.

Scope:

- Testnet contracts.
- Sponsored test gas.
- Synthetic ticker factions.
- Faucet-issued or non-transferable action units that mimic the $1 interaction.
- Explicit reusable token allowance, visible remaining approval, threshold refresh confirmation, and revocation.
- Public replay and receipts.

Exit gates:

- Contract invariants and fuzzing.
- Load and ordering tests.
- Session-budget enforcement.
- Incident and cancellation rehearsal.
- Evidence that timer and control scoring remain understandable and deterministic.

### Stage 2: Sponsor-funded USDG

Value: sponsor-funded rewards; no Stock Token custody.

Scope:

- Real ticker themes and canonical price display if permitted.
- Sponsor-funded pot.
- Free tickets or tightly limited paid actions only after product counsel.
- No player Stock Token lock.

Required gates:

- Product counsel approval for jurisdictions and game structure.
- Terms, disclosures, age restrictions, and geolocation controls.
- Independent contract audit.
- Economic review and abuse simulation.
- Production operations and incident coverage.
- Treasury, sanctions, tax, and accounting workflows.

### Stage 3: Eligible Stock Token mode

Value: canonical Stock Token lock plus USDG play.

Required gates:

- Written counsel position on Stock Token eligibility and custody flow.
- Supported-jurisdiction and restricted-person design.
- Eligibility attestation that the contract can enforce where required.
- Canonical asset registry and feed controls.
- Asset halt, inactive-asset, corporate-action, and sequencer runbooks.
- Updated independent audit including token custody.
- Clear withdrawal and emergency-recovery evidence.

## Compliance requirements

| ID | Requirement |
|---|---|
| `RISK-COMP-001` | Do not call Stock Tokens wrapped shares or imply equity ownership. |
| `RISK-COMP-002` | Disclose that the same token amount is returned, not a guaranteed fiat value. |
| `RISK-COMP-003` | Do not use `rug`, `exit scam`, or other meme language to imply that protocol theft is possible or intended. |
| `RISK-COMP-004` | Display exact action cost, pot sources, payout shares, eligibility, and withdrawal terms before authorization. |
| `RISK-COMP-005` | Do not claim the game is investment advice, a savings product, risk-free, bot-proof, or fair in a legally absolute sense. |
| `RISK-COMP-006` | Product counsel must determine whether game, contest, gambling, sweepstakes, securities, payments, money-transmission, sanctions, tax, and consumer-protection regimes apply. |
| `RISK-COMP-007` | Geo-blocking alone is not assumed to satisfy eligibility requirements. |
| `RISK-COMP-008` | Restricted-person and jurisdiction controls must be testable and auditable without storing unnecessary sensitive data. |
| `RISK-COMP-009` | Terms and disclosures must match contract behavior and current asset availability. |
| `RISK-COMP-010` | Marketing cannot promise returns, suggest guaranteed winnings, or imply a Stock Token holder owns the referenced company. |

## Risk register

| ID | Risk | Severity | Required control | Launch gate |
|---|---|---:|---|---|
| `RISK-001` | Product structure violates an applicable game, contest, gambling, securities, or payments rule. | Critical | Current product counsel, jurisdiction matrix, enforceable eligibility, terms aligned to contract. | Stage 2+ |
| `RISK-002` | Contract loses principal or prize funds. | Critical | Minimal contracts, pull payments, invariants, fuzzing, audit, monitoring, incident plan. | Stage 2+ |
| `RISK-003` | Admin or upgrade authority can alter a live winner. | Critical | Immutable live-round config, least privilege, multisig and delays, public admin events. | Stage 1+ |
| `RISK-004` | Session authorization permits excess spend or arbitrary transfer. | Critical | Round/function/token/amount scoping, expiry, revocation, contract enforcement. | Stage 1+ |
| `RISK-005` | Rapid actions receive zero control time or inconsistent faction payouts. | High | Timer/scoring simulation, precision decision, deterministic tie rules, replay parity. | Stage 1 exit |
| `RISK-006` | Bots and Sybil wallets dominate final claims. | High | Honest disclosure, no self-extension, per-wallet block limit, economics testing, bot telemetry, avoid false fairness claim. | Stage 2+ |
| `RISK-007` | RPC, indexer, or sequencer delay shows the wrong holder. | High | Canonical-event authority, no optimistic crown, lag indicator, direct-read fallback, replay. | Stage 1+ |
| `RISK-008` | First-come sequencing still advantages colocated or automated actors. | High | Publish ordering model, measure latency, limit claims where appropriate, retain faction pool. | Stage 2+ |
| `RISK-009` | Stock Token unavailable, inactive, halted, or restricted. | Critical | Canonical allowlist, active-status checks, new-entry pause, guaranteed withdrawal path. | Stage 3 |
| `RISK-010` | Stale feed or sequencer outage accepts an invalid entry value. | High | Feed freshness, sequencer health check, fail closed for new entry. | Stage 3 |
| `RISK-011` | Corporate-action multiplier is applied twice. | High | One documented price pipeline, integration tests, no duplicate `uiMultiplier()` application. | Stage 3 |
| `RISK-012` | Fee-on-transfer, rebasing, or malicious token breaks accounting. | Critical | Canonical registry only, token-behavior validation, unsupported-token rejection. | Stage 3 |
| `RISK-013` | Meme copy is interpreted as deceptive or malicious protocol intent. | Medium | Literal paired explanation, compliance review, restricted official lexicon. | Stage 2+ |
| `RISK-014` | Player spends more than intended during a rapid round. | High | Preselected maximum, remaining budget, action count, contract-enforced cap, no silent top-up. | Stage 1+ |
| `RISK-015` | Failed action charges game fee or UI misstates cost. | High | Atomic fee/state transition, precise submitted/accepted/rejected language, integration tests. | Stage 1+ |
| `RISK-016` | Settlement is delayed or blocked by a participant. | High | Anyone-can-settle, pull claims, no participant loop, no external dependency in finalization. | Stage 1+ |
| `RISK-017` | Sponsor, treasury, or operations funds are misaccounted. | High | Separate balances, event traceability, reconciliation, multisig, withdrawal policy. | Stage 2+ |
| `RISK-018` | Frontend or dependency compromise changes addresses or approvals. | Critical | Reproducible builds, CSP, dependency controls, address verification, deployment monitoring. | Stage 2+ |
| `RISK-019` | Receipt or replay fabricates a result. | Medium | Deterministic onchain-derived inputs, visible contract identity, direct verification. | Stage 1+ |
| `RISK-020` | Third-party brand or archived graphic is copied. | Medium | Original mascots and layouts, no corporate logos, design review and asset provenance. | Public launch |

## Admin authority requirements

| Action | Before entry | Live round | After settlement |
|---|---|---|---|
| Publish future round | Allowed | N/A | Allowed |
| Change live fee, timer, factions, or payout | Not after entry opens | Prohibited | Prohibited |
| Disable new entry for an unhealthy asset | Allowed | Allowed for new entry only | N/A |
| Stop new claims | Emergency only | Emergency cancellation path | N/A |
| Select winner | Prohibited | Prohibited | Prohibited |
| Settle | Anyone | After end only | Already settled |
| Withdraw operations allocation | No | No | Allowed under treasury policy |
| Recover unrelated tokens | Limited and documented | Cannot touch accounted balances | Limited and documented |

`RISK-030`: Every privileged action emits a public event and appears on the status page.

## Incident states

### Weak Signal

Read infrastructure is degraded but chain actions may remain available.

Requirements:

- Show lag and last verified block.
- Stop one-tap submission if the UI cannot reliably display canonical holder state.
- Offer direct explorer verification.

### Signal Lost

New entry is paused because an asset, feed, paymaster, or eligibility dependency is unavailable.

Requirements:

- Existing principal remains withdrawable under the round rules.
- Explain whether claims remain open.
- Do not substitute another asset or feed silently.

### Dead Air

The game cannot safely accept actions.

Requirements:

- Disable submission.
- Preserve evidence.
- Use the cancellation or settlement path defined by contract state.
- State whether game fees, principal, and gas are refundable.

### Contract incident

Requirements:

- Activate the documented emergency authority only within its published scope.
- Preserve onchain and application logs.
- Publish affected contracts and rounds.
- Prevent new rounds from using the affected version.
- Do not claim funds are safe until verified.

## Operational requirements

Before Stage 2:

- Named incident owner and backup.
- 24-hour alerting for contract balance, event, indexing, and withdrawal anomalies during scheduled play.
- Treasury multisig and signer runbook.
- Asset and feed health dashboard.
- Round reconciliation.
- Customer-support response templates.
- Public status page.
- Deployment rollback for frontend only; contract response follows versioned incident policy.
- Disclosure and post-incident process.

## Go/no-go checklist for value-bearing launch

All must be true:

- Product-owner approval of game constants and payout.
- Counsel approval of the launch structure and jurisdictions.
- Eligibility implementation tested.
- Independent contract audit issues resolved or explicitly accepted.
- Property, invariant, integration, load, and adversarial tests pass.
- Mainnet addresses and supported assets verified.
- Session authorization independently reviewed.
- Emergency and cancellation rehearsals completed.
- Treasury and accounting reconciliation proven.
- Public rules exactly match deployed bytecode and configuration.
- Monitoring and incident staffing active.

## Open launch decisions

| ID | Decision needed |
|---|---|
| `RISK-OPEN-001` | Jurisdiction and restricted-person matrix. |
| `RISK-OPEN-002` | Age and identity requirements. |
| `RISK-OPEN-003` | Legal classification of each launch stage. |
| `RISK-OPEN-004` | Sponsor and treasury entity. |
| `RISK-OPEN-005` | Tax reporting and record-retention obligations. |
| `RISK-OPEN-006` | Sanctions and wallet-screening controls. |
| `RISK-OPEN-007` | Exact emergency authority and cancellation refund policy. |
| `RISK-OPEN-008` | Customer-support and incident coverage model. |
