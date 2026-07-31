# Last Bell v4 release authority gates

## Internal assurance and acknowledged risk

- Run pinned static analyzers, Foundry fuzz/invariants, negative controls,
  mainnet-fork tests, the complete torture campaign, integration tests, and the
  protected-build scan.
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

- The authorized mock-only testnet deployment and exactly two settled rounds
  are complete and reconciled.
- External-wallet UAT is explicitly `SKIPPED_BY_OPERATOR`, not passed.
  Browser-wallet compatibility remains `UNVERIFIED` and must be displayed as
  such. WalletConnect is hidden when no production Reown project is configured.
- Mainnet requires a separate commit-, manifest-, deployer-, and canary-bound
  authorization. The compile-time lock remains closed until then.
- The canary uses the privileged deployer plus one encrypted non-admin player
  through server-side signed transactions; this does not validate extensions
  or WalletConnect.
