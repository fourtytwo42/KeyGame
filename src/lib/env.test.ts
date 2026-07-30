import { describe, expect, it } from "vitest";
import { readPublicEnvironment } from "./env";

describe("environment validation", () => {
  it("supports a dependency-free simulator configuration", () => {
    expect(readPublicEnvironment({}).mode).toBe("simulator");
  });

  it("supports mainnet through the same-origin RPC relay", () => {
    const environment = readPublicEnvironment({
      NEXT_PUBLIC_GAME_MODE: "mainnet",
      NEXT_PUBLIC_APP_URL: "https://lastbell.example/",
      NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS:
        "0x1111111111111111111111111111111111111111",
      NEXT_PUBLIC_DEV_DOLLAR_ADDRESS:
        "0x2222222222222222222222222222222222222222",
      NEXT_PUBLIC_PAYMENT_ROUTER_ADDRESS:
        "0x3333333333333333333333333333333333333333",
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "reown-test-project",
      NEXT_PUBLIC_WALLETCONNECT_ALLOWED_ORIGINS: "https://lastbell.example",
    });

    expect(environment.mode).toBe("mainnet");
    expect(environment.robinhoodMainnetRpcUrl).toBe(
      "https://lastbell.example/api/rpc/mainnet",
    );
  });

  it("fails with a literal message for an invalid mode", () => {
    expect(() =>
      readPublicEnvironment({ NEXT_PUBLIC_GAME_MODE: "mainframe" }),
    ).toThrow(/LAST BELL CONFIGURATION ERROR: NEXT_PUBLIC_GAME_MODE/);
  });

  it("rejects malformed contract addresses", () => {
    expect(() =>
      readPublicEnvironment({
        NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS: "0xnope",
      }),
    ).toThrow(/20-byte EVM address/);
  });

  it("rejects a mainnet build that would inherit local contract addresses", () => {
    expect(() =>
      readPublicEnvironment({ NEXT_PUBLIC_GAME_MODE: "mainnet" }),
    ).toThrow(/NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS is required/);
  });

  it("rejects mainnet without Reown and an allowlisted application origin", () => {
    expect(() =>
      readPublicEnvironment({
        NEXT_PUBLIC_GAME_MODE: "mainnet",
        NEXT_PUBLIC_APP_URL: "https://lastbell.example",
        NEXT_PUBLIC_LAST_BELL_ROUND_ADDRESS:
          "0x1111111111111111111111111111111111111111",
        NEXT_PUBLIC_DEV_DOLLAR_ADDRESS:
          "0x2222222222222222222222222222222222222222",
        NEXT_PUBLIC_PAYMENT_ROUTER_ADDRESS:
          "0x3333333333333333333333333333333333333333",
      }),
    ).toThrow(/NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID/);
  });
});
