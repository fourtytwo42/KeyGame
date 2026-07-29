import { describe, expect, it } from "vitest";
import { readPublicEnvironment } from "./env";

describe("environment validation", () => {
  it("supports a dependency-free simulator configuration", () => {
    expect(readPublicEnvironment({}).mode).toBe("simulator");
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
});
