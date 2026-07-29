import { describe, expect, it } from "vitest";
import { readRpcEndpoints } from "./rpc-routing";

describe("Robinhood RPC routing", () => {
  it("uses the LAN nodes as the default primaries", () => {
    expect(readRpcEndpoints("testnet", {}).primary).toBe(
      "http://192.168.50.117:8547/",
    );
    expect(readRpcEndpoints("mainnet", {}).primary).toBe(
      "http://192.168.50.173:8547/",
    );
  });

  it("accepts a private provider fallback without exposing it publicly", () => {
    const endpoints = readRpcEndpoints("mainnet", {
      ROBINHOOD_MAINNET_FALLBACK_RPC_URL: "https://provider.example/v2/private",
    });

    expect(endpoints.fallback).toBe("https://provider.example/v2/private");
  });
});
