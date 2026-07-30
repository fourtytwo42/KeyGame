import { NextResponse } from "next/server";
import { getAddress, isAddress, parseEther } from "viem";
import { database } from "@/lib/server/db";
import { loadServerDeployment } from "@/lib/server/deployment";
import { deploymentPublicClient } from "@/lib/server/rpc-client";
import { loadRoleWallet } from "@/lib/server/role-wallet";
import { devDollarAbi } from "@/lib/web3/last-bell-abi";

export async function fundUatWallet(request: Request) {
  if (
    process.env.KEYGAME_UAT_ENABLED !== "true" ||
    process.env.NEXT_PUBLIC_GAME_MODE !== "testnet"
  ) {
    return NextResponse.json(
      { ok: false, error: "The UAT faucet is not available in this build." },
      { status: 404 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    address?: string;
  } | null;
  if (!body?.address || !isAddress(body.address)) {
    return NextResponse.json(
      { ok: false, error: "A valid testnet wallet address is required." },
      { status: 400 },
    );
  }
  const address = getAddress(body.address);
  const connection = await database.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      address.toLowerCase(),
    ]);
    const recent = await connection.query(
      `SELECT 1 FROM uat_funding_requests
       WHERE lower(wallet_address)=lower($1)
         AND requested_at > now() - interval '10 minutes' LIMIT 1`,
      [address],
    );
    if (recent.rowCount) {
      await connection.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          error: "This wallet was funded recently. Try again in ten minutes.",
        },
        { status: 429 },
      );
    }
    const manifest = await loadServerDeployment();
    if (manifest.chainId !== 46630 || !manifest.mockOnly) {
      throw new Error("The faucet refuses non-mock or non-testnet manifests.");
    }
    const publicClient = deploymentPublicClient(manifest);
    const wallet = await loadRoleWallet("faucet", manifest);
    if (!wallet.account) throw new Error("Faucet account unavailable.");
    const nativeHash = await wallet.sendTransaction({
      account: wallet.account,
      chain: wallet.chain,
      to: address,
      value: parseEther("0.01"),
    });
    const nativeReceipt = await publicClient.waitForTransactionReceipt({
      hash: nativeHash,
    });
    if (nativeReceipt.status !== "success") {
      throw new Error("Test ETH funding reverted.");
    }
    const tokenRequest = await publicClient.simulateContract({
      account: wallet.account,
      address: manifest.contracts.paymentToken,
      abi: devDollarAbi,
      functionName: "mint",
      args: [address, 1_000_000_000n],
    });
    const tokenHash = await wallet.writeContract(tokenRequest.request);
    const tokenReceipt = await publicClient.waitForTransactionReceipt({
      hash: tokenHash,
    });
    if (tokenReceipt.status !== "success") {
      throw new Error("Mock USDG funding reverted.");
    }
    await connection.query(
      `INSERT INTO uat_funding_requests(
         wallet_address,native_transaction_hash,token_transaction_hash)
       VALUES($1,$2,$3)`,
      [address, nativeHash, tokenHash],
    );
    await connection.query("COMMIT");
    return NextResponse.json({ ok: true, nativeHash, tokenHash });
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => undefined);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Testnet funding failed.",
      },
      { status: 503 },
    );
  } finally {
    connection.release();
  }
}
