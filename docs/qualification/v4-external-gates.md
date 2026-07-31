# Last Bell v4 release authority gates

Status: no testnet or mainnet broadcast is authorized by implementation work.

## Internal assurance and risk acceptance

- Run the pinned static analyzers, Foundry fuzz/invariants, negative controls, mainnet-fork suite, full torture campaign, integration tests, and protected-build scan.
- Resolve every critical/high finding or record a complete, test-linked suppression.
- Publish the checksummed `INTERNALLY REVIEWED · NO INDEPENDENT AUDIT` report.
- Sign the operator risk-acceptance artifact acknowledging the absence of external legal review and an independent security audit.

Internal assurance reduces risk but is not legal advice and is not an independent audit. The operator owns unresolved Stock Token, gaming, recurring-reward, tax, sanctions, privacy, jurisdiction, economic, and security risk.

## Safes and operational ownership

- Supply three independently controlled owners and three distinct 2-of-3 Safe addresses.
- Verify pinned runtime bytecode, implementation provenance, owners, threshold, chain, and addresses.
- Complete two-step manager and market-admin acceptance from the appropriate Safe.
- Isolate keeper and conversion keys and assign incident, treasury, keeper, security, and communication owners.

## Wallet and network gates

- Separate commit-bound authorization for the two-round mock testnet smoke.
- External-wallet UAT for MetaMask, Rabby, Coinbase, Safe, WalletConnect QR, and EIP-6963 before mainnet.
- Separate commit-, manifest-, deployer-, and canary-bound mainnet authorization.
- Separate approval of the reconciled 24-hour canary before public promotion.
