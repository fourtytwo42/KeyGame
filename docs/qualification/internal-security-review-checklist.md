# Last Bell v4 Internal Security Review

Release label: **INTERNALLY REVIEWED · NO INDEPENDENT AUDIT**

For every external or public contract function, record the reviewer, source commit, conclusion, and linked test while covering:

- Authorization and two-step administrative handoff.
- USDG and Stock Token custody, approvals, exact balance deltas, and callback authentication.
- Reentrancy, malicious tokens/adapters, denial of service, unsolicited transfers, and failed conversions.
- Contribution atomicity, timer transitions, heat buckets, points, winner selection, and claim order.
- Basket rounding, lifetime epochs, cancellation refunds, seed rollover, and protocol conversion.
- Manager, router, vault, adapter, treasury, catalog, and round deployment relationships.
- Keeper nonce recovery, indexer reorg handling, protected bundles, and authorization boundaries.

Critical or high findings block release. A suppression is valid only when every field required by `security/suppressions.json` is present and a regression test demonstrates the intended behavior.
