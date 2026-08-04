# Last Bell v4 local release evidence

The baseline below was verified 2026-07-31 on the KeyGame VM. The later
treasury-rotation candidate passed a complete clean torture rerun and internal
assurance. One historical mock-only v4 testnet deployment and exactly two smoke
rounds completed, but its bytecode predates the lifetime reward rounding repair.
Mainnet has not been broadcast.

## Accepted source

- Qualified source commit: `8f96285784d57d05229fb12cf829281932f7d6f0`
- Contract version: `last-bell-v4-stock-pot`
- Torture run: `v4-torture-live-2026-07-31T07-10-55-856Z`
- Contract state-machine actions: 1,000,000
- Accepted live contributions: 10,000
- Settled rounds: 500
- Cancelled rounds: 50
- Confirmed distinct transactions: 13,825
- Per-token reconciliation rows: 2,200
- Basket discrepancies: 0
- Point discrepancies: 0
- Failed assertions or actions: 0
- Restored faults: 11

The fault campaign covered keeper, indexer, and web restarts; complete
termination of torture PostgreSQL sessions during active play; RPC pause;
post-run PostgreSQL reconnect; isolated reorganization; and duplicate-round
fixtures. The database-session fault exposed a process-recovery gap during an
earlier partial run. Commit `4319262` added transient database retry and pool
disconnect handling; commit `8f96285` added systemd-equivalent supervision to
the isolated harness. The final accepted run includes both fixes.

## Local release gates

- Foundry: 54 tests passed.
- Vitest: 57 tests passed across 14 files.
- Isolated live-Anvil integration: four tests passed.
- Playwright desktop/mobile: 20 applicable tests passed and two
  viewport-specific tests skipped by design.
- Accessibility: no serious or critical axe violations on the tested core
  pages.
- Formatting, ESLint, and TypeScript: passed.
- Next.js production build: passed.
- Protected mainnet JavaScript scan: passed with devnet transaction facilities
  compiled out.
- Robinhood mainnet fork: two adapter tests passed against the five pinned
  direct pools.
- Live mainnet preflight: AAPL, TSLA, SPY, and NVDA safe; AMZN excluded for
  greater than 1% simulated $1,000 buy impact.

## Remaining release gates

The one-hour chain-31337 launch rehearsal and historical testnet network smoke
passed, but the current-bytecode replacement testnet smoke remains blocking and
requires new authorization. The final packager now rejects mismatched bytecode,
anything other than exactly two reconciled rounds with two players, missing
reward categories, or a started third round. External-wallet UAT is skipped,
not passed, and browser compatibility remains unverified. Fresh mainnet market
safety, incident ownership, funding, the dedicated compile-lock commit,
read-only deployment authorization, and later public-promotion authorization
remain blocking.
