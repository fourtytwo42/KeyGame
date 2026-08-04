import { describe, expect, it } from "vitest";
import { classifyLanRpcHealth, readRpcEndpoints } from "./rpc-routing";

describe("Robinhood RPC routing", () => {
  it("uses the LAN nodes as the default primaries", () => {
    expect(readRpcEndpoints("testnet", {}).primary).toBe(
      "http://192.168.50.117:8547/",
    );
    expect(readRpcEndpoints("mainnet", {}).primary).toBe(
      "http://192.168.50.173:8547/",
    );
  });

  it("accepts a private provider as an observational reference", () => {
    const endpoints = readRpcEndpoints("mainnet", {
      ROBINHOOD_MAINNET_FALLBACK_RPC_URL: "https://provider.example/v2/private",
    });

    expect(endpoints.fallback).toBe("https://provider.example/v2/private");
  });

  it("marks a LAN node more than five blocks behind as degraded", () => {
    expect(
      classifyLanRpcHealth({
        primaryAvailable: true,
        primaryHead: 100n,
        referenceAvailable: true,
        referenceHead: 106n,
      }),
    ).toMatchObject({ status: "degraded", lag: 6n, reason: "PRIMARY_BEHIND" });
  });

  it("does not degrade a healthy LAN node when the reference is unavailable", () => {
    expect(
      classifyLanRpcHealth({
        primaryAvailable: true,
        primaryHead: 100n,
        referenceAvailable: false,
      }),
    ).toMatchObject({
      status: "healthy",
      primaryHead: 100n,
      reason: "REFERENCE_UNAVAILABLE",
    });
  });

  it("marks an unavailable LAN node as degraded even when reference is live", () => {
    expect(
      classifyLanRpcHealth({
        primaryAvailable: false,
        referenceAvailable: true,
        referenceHead: 106n,
      }),
    ).toMatchObject({ status: "degraded", reason: "PRIMARY_UNAVAILABLE" });
  });
});
