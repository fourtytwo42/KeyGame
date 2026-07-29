"use client";

import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import {
  useAccount,
  useBalance,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { shortAddress } from "@/lib/game/constants";
import { walletConnectConfigured } from "@/lib/web3/config";
import { robinhoodChainTestnet } from "@/lib/web3/chains";

export function WalletPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { address, chain, isConnected, status } = useAccount();
  const balance = useBalance({ address });
  const { connectors, connect, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const uniqueConnectors = connectors.filter(
    (connector, index, list) =>
      list.findIndex((item) => item.name === connector.name) === index,
  );

  return (
    <>
      <button
        className="utilityButton walletTrigger"
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="statusDot" data-online={isConnected} />
        {isConnected && address ? shortAddress(address) : "TUNE WALLET"}
      </button>
      {open ? (
        <div className="modalScrim" role="presentation">
          <div
            className="walletPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-title"
            tabIndex={-1}
            ref={panelRef}
          >
            <div className="panelHeader">
              <div>
                <span className="eyebrow">CONTROL ROOM / LINE 03</span>
                <h2 id="wallet-title">Wallet & session</h2>
              </div>
              <button
                type="button"
                className="closeButton"
                onClick={() => setOpen(false)}
                aria-label="Close wallet panel"
              >
                ×
              </button>
            </div>

            {isConnected && address ? (
              <div className="walletConnected">
                <div className="signalCard">
                  <span>CALLER ID</span>
                  <strong>{shortAddress(address)}</strong>
                  <code>{address}</code>
                </div>
                <dl className="definitionGrid">
                  <div>
                    <dt>Network</dt>
                    <dd>{chain?.name ?? "Unknown"}</dd>
                  </div>
                  <div>
                    <dt>Balance</dt>
                    <dd>
                      {balance.data
                        ? `${Number(
                            formatUnits(
                              balance.data.value,
                              balance.data.decimals,
                            ),
                          ).toFixed(4)} ${balance.data.symbol}`
                        : "Tuning…"}
                    </dd>
                  </div>
                  <div>
                    <dt>Round budget</dt>
                    <dd>Not authorized</dd>
                  </div>
                  <div>
                    <dt>Spent</dt>
                    <dd>$0 / $20</dd>
                  </div>
                </dl>
                {chain?.id !== robinhoodChainTestnet.id ? (
                  <button
                    className="secondaryAction fullWidth"
                    type="button"
                    disabled={switching}
                    onClick={() =>
                      switchChain({ chainId: robinhoodChainTestnet.id })
                    }
                  >
                    {switching
                      ? "SWITCHING CHANNEL…"
                      : "SWITCH TO ROBINHOOD TESTNET"}
                  </button>
                ) : null}
                <button
                  className="textButton danger"
                  type="button"
                  onClick={() => disconnect()}
                >
                  Hang up wallet
                </button>
              </div>
            ) : (
              <>
                <p className="panelLead">
                  Spectating is free. Connect only when you want to enter a bag
                  or take the bell.
                </p>
                <div className="connectorList">
                  {uniqueConnectors.map((connector) => (
                    <button
                      className="connectorButton"
                      type="button"
                      key={connector.uid}
                      disabled={isPending}
                      onClick={() => connect({ connector })}
                    >
                      <span className="connectorIcon" aria-hidden="true">
                        {connector.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span>
                        <strong>{connector.name}</strong>
                        <small>
                          {connector.name.includes("Injected")
                            ? "MetaMask, Rabby, Brave and EIP-6963 wallets"
                            : "Open this wallet to connect"}
                        </small>
                      </span>
                      <span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
                {!walletConnectConfigured ? (
                  <div className="tapeNotice">
                    <strong>WALLETCONNECT NEEDS A PROJECT ID</strong>
                    <span>
                      Add <code>NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID</code> to
                      enable mobile QR connections.
                    </span>
                  </div>
                ) : null}
                {error ? (
                  <p className="inlineError" role="alert">
                    {error.message}
                  </p>
                ) : null}
                <p className="legalMicro">
                  A wallet connection does not authorize spending. Every
                  value-bearing action shows its amount before submission.
                </p>
              </>
            )}
            <span className="srOnly" aria-live="polite">
              Wallet status: {status}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}
