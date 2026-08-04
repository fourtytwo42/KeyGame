import type { RoundState } from "@/lib/game/types";
import { shortAddress } from "@/lib/game/constants";

export function OnchainVerification({
  state,
  playerNumerator,
  totalDenominator,
}: {
  state: RoundState;
  playerNumerator?: number;
  totalDenominator?: number;
}) {
  const explorer =
    state.chainId === 46630
      ? "https://explorer.testnet.chain.robinhood.com"
      : state.chainId === 4663
        ? "https://robinhoodchain.blockscout.com"
        : null;
  return (
    <details className="onchainDrawer">
      <summary>VERIFY ONCHAIN</summary>
      <dl>
        <div>
          <dt>Chain</dt>
          <dd>{state.chainId ?? "SIMULATOR"}</dd>
        </div>
        <div>
          <dt>Round</dt>
          <dd>{state.roundId ?? "—"}</dd>
        </div>
        <div>
          <dt>Contract</dt>
          <dd>
            {state.contractAddress ? (
              explorer ? (
                <a
                  href={`${explorer}/address/${state.contractAddress}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(state.contractAddress)} ↗
                </a>
              ) : (
                shortAddress(state.contractAddress)
              )
            ) : (
              "LOCAL"
            )}
          </dd>
        </div>
        <div>
          <dt>Settlement</dt>
          <dd>
            {state.settlementTx ? (
              explorer ? (
                <a
                  href={`${explorer}/tx/${state.settlementTx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {shortAddress(state.settlementTx)} ↗
                </a>
              ) : (
                shortAddress(state.settlementTx)
              )
            ) : (
              "PENDING"
            )}
          </dd>
        </div>
        <div>
          <dt>Payout math</dt>
          <dd>
            {playerNumerator ?? 0} / {totalDenominator ?? 0}
          </dd>
        </div>
        <div>
          <dt>Stock basket</dt>
          <dd>
            {state.stockPot
              ?.map(
                (asset) => `${asset.tokenAmount.toFixed(4)} ${asset.ticker}`,
              )
              .join(" · ") || "—"}
          </dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{state.contractVersion}</dd>
        </div>
      </dl>
    </details>
  );
}
