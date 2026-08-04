import { readFile } from "node:fs/promises";
import path from "node:path";
import { createPublicClient, http, keccak256, parseAbi } from "viem";
import { robinhoodChainTestnet } from "../src/lib/web3/chains";

const catalog = JSON.parse(
  await readFile(
    path.join(process.cwd(), "config", "testnet-stock-token-mocks.json"),
    "utf8",
  ),
) as {
  verifiedChainId: number;
  assets: Array<{ symbol: string; testnetMockAddress: `0x${string}` }>;
};
if (catalog.verifiedChainId !== 46630) {
  throw new Error("Asset catalog is not pinned to Robinhood testnet.");
}
const client = createPublicClient({
  chain: robinhoodChainTestnet,
  transport: http(
    process.env.ROBINHOOD_TESTNET_RPC_URL ?? "http://192.168.50.117:8547",
  ),
});
if ((await client.getChainId()) !== 46630) throw new Error("Wrong chain.");
const verified = [];
const mockAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
]);
for (const asset of catalog.assets) {
  const code = await client.getCode({ address: asset.testnetMockAddress });
  if (!code || code === "0x") {
    throw new Error(`${asset.symbol} has no testnet bytecode.`);
  }
  const [symbol, zeroBalance] = await Promise.all([
    client.readContract({
      address: asset.testnetMockAddress,
      abi: mockAbi,
      functionName: "symbol",
    }),
    client.readContract({
      address: asset.testnetMockAddress,
      abi: mockAbi,
      functionName: "balanceOf",
      args: ["0x0000000000000000000000000000000000000000"],
    }),
  ]);
  const expectedMockSymbol = `tm${asset.symbol}`;
  if (
    (symbol !== asset.symbol && symbol !== expectedMockSymbol) ||
    zeroBalance !== 0n
  ) {
    throw new Error(`${asset.symbol} failed mock-token compatibility checks.`);
  }
  verified.push({
    symbol: asset.symbol,
    address: asset.testnetMockAddress,
    contractSymbol: symbol,
    runtimeCodeHash: keccak256(code),
  });
}
process.stdout.write(
  `${JSON.stringify({ chainId: 46630, verified }, null, 2)}\n`,
);
