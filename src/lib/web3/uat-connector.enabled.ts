import { createConnector } from "wagmi";
import {
  getAddress,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";

const STORAGE_KEY = "keygame:uat-testnet-wallet";
const CHAIN_ID = 46630;

function loadAccount(): PrivateKeyAccount {
  const stored = window.sessionStorage.getItem(STORAGE_KEY) as Hex | null;
  const privateKey = stored ?? generatePrivateKey();
  if (!stored) window.sessionStorage.setItem(STORAGE_KEY, privateKey);
  return privateKeyToAccount(privateKey);
}

export const uatConnector = createConnector<EIP1193Provider>((config) => {
  let connected = false;
  let account: PrivateKeyAccount | undefined;

  const provider: EIP1193Provider = {
    on() {},
    removeListener() {},
    request: (async ({ method, params }) => {
      account ??= loadAccount();
      if (method === "eth_chainId") return numberToHex(CHAIN_ID);
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return [account.address];
      }
      if (method === "wallet_switchEthereumChain") {
        const requested = Number(
          (params as [{ chainId: Hex }])?.[0]?.chainId,
        );
        if (requested !== CHAIN_ID) {
          throw new Error("The UAT wallet is restricted to chain 46630.");
        }
        return null;
      }
      if (method === "personal_sign") {
        const [message] = params as [Hex, Address];
        return account.signMessage({ message: { raw: message } });
      }
      if (method === "eth_signTypedData_v4") {
        const [, typedData] = params as [Address, string];
        return account.signTypedData(JSON.parse(typedData));
      }
      if (method === "eth_sendTransaction") {
        const transaction = (params as [
          { to?: Address; data?: Hex; value?: Hex },
        ])[0];
        const response = await fetch("/api/rpc/testnet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getTransactionCount",
            params: [account.address, "pending"],
          }),
        });
        const noncePayload = (await response.json()) as { result: Hex };
        const { createWalletClient, http } = await import("viem");
        const wallet = createWalletClient({
          account,
          chain: config.chains.find((chain) => chain.id === CHAIN_ID),
          transport: http("/api/rpc/testnet"),
        });
        return wallet.sendTransaction({
          account,
          to: transaction.to,
          data: transaction.data,
          value: transaction.value ? BigInt(transaction.value) : undefined,
          nonce: Number(BigInt(noncePayload.result)),
          chain: config.chains.find((chain) => chain.id === CHAIN_ID),
        });
      }
      const response = await fetch("/api/rpc/testnet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const payload = (await response.json()) as {
        result?: unknown;
        error?: { message?: string };
      };
      if (payload.error) throw new Error(payload.error.message || method);
      return payload.result;
    }) as EIP1193Provider["request"],
  };

  return {
    id: "keygame-uat-testnet",
    name: "Built-in Testnet Wallet",
    type: "keygame-uat-testnet",
    async connect<withCapabilities extends boolean = false>({
      withCapabilities,
    }: {
      withCapabilities?: withCapabilities | boolean;
    } = {}) {
      account ??= loadAccount();
      connected = true;
      const address = getAddress(account.address);
      return {
        accounts: (withCapabilities
          ? [{ address, capabilities: {} }]
          : [address]) as never,
        chainId: CHAIN_ID,
      };
    },
    async disconnect() {
      connected = false;
    },
    async getAccounts() {
      if (!connected) return [];
      account ??= loadAccount();
      return [getAddress(account.address)];
    },
    async getChainId() {
      return CHAIN_ID;
    },
    async getProvider() {
      return provider;
    },
    async isAuthorized() {
      return (
        connected &&
        typeof window !== "undefined" &&
        Boolean(window.sessionStorage.getItem(STORAGE_KEY))
      );
    },
    async switchChain({ chainId }) {
      const chain = config.chains.find((candidate) => candidate.id === chainId);
      if (!chain || chainId !== CHAIN_ID) {
        throw new Error("The UAT wallet is restricted to chain 46630.");
      }
      return chain;
    },
    onAccountsChanged(accounts) {
      config.emitter.emit("change", {
        accounts: accounts.map((value) => getAddress(value)),
      });
    },
    onChainChanged(chainId) {
      config.emitter.emit("change", { chainId: Number(chainId) });
    },
    async onDisconnect() {
      connected = false;
      config.emitter.emit("disconnect");
    },
  };
});
