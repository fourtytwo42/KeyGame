# Last Bell v4 release authority gates

## Internal assurance and acknowledged risk

- Run pinned static analyzers, Foundry fuzz/invariants, negative controls,
  mainnet-fork tests, the complete torture campaign, integration tests, and the
  protected-build scan.
- Build every deployable artifact with the pinned Foundry `release` profile and
  require `contracts:check-sizes` to pass the 23,000-byte production budget and
  24,576-byte EIP-170 absolute limit. The planned manifest must bind the report
  hash, compiler configuration hash, runtime sizes, and runtime hashes.
- Resolve every critical/high finding or record a test-linked suppression.
- Publish checksummed evidence labeled
  `INTERNALLY REVIEWED · NO INDEPENDENT AUDIT`.
- Record the operator acknowledgement `No legal review or independent audit`.
  No signature or risk-acceptance hash is required.

Internal assurance is neither legal advice nor an independent audit. The
operator retains the regulatory, economic, operational, and security risk.

## Role custody

- The encrypted deployer EOA initially holds every privileged role.
- Verify all initial roles, contract relationships, and empty pending transfers
  against the derived keystore address.
- Preserve independent two-step migration for manager, market, and treasury;
  keeper remains independently rotatable.

## Wallet and network gates

- The current-bytecode mock-only testnet deployment and exactly two settled
  rounds remain reconciled. Constructor configuration changes, including the
  five-minute opening timer, still require a separately authorized replacement
  testnet deployment before that configuration can qualify for mainnet.
- External-wallet UAT is explicitly `SKIPPED_BY_OPERATOR`, not passed.
  Browser-wallet compatibility remains `UNVERIFIED` and must be displayed as
  such. WalletConnect is hidden when no production Reown project is configured.
- Mainnet requires a separate commit-, manifest-, and deployer-bound
  authorization with `launchValidation: READ_ONLY`. The compile-time lock
  remains closed until then. Legacy canary-scoped authorizations are invalid.
- The one-hour launch rehearsal runs only on isolated chain 31337 with two
  deterministic non-admin players. It does not validate browser extensions,
  WalletConnect, or live mainnet gameplay.
- Mainnet deployment validation is read-only. Public promotion requires a
  second authorization bound to the deployed manifest and checksummed
  verification report.
- The final candidate packager fails closed unless the replacement testnet
  manifest, current-bytecode comparison, two-round reconciliation, two-player
  evidence, all reward categories, and unstarted third round agree on the exact
  frozen commit.
