import { describe, expect, it } from "vitest";
import { isCompletedRollover } from "./v4-soak";

describe("isCompletedRollover", () => {
  const prior = "0x0000000000000000000000000000000000000001";
  const next = "0x0000000000000000000000000000000000000002";

  it("accepts settled and cancelled rounds after the active pointer changes", () => {
    expect(isCompletedRollover(4, next, prior)).toBe(true);
    expect(isCompletedRollover(5, next, prior)).toBe(true);
  });

  it("rejects nonterminal phases and unchanged active pointers", () => {
    expect(isCompletedRollover(3, next, prior)).toBe(false);
    expect(isCompletedRollover(4, prior, prior)).toBe(false);
    expect(isCompletedRollover(5, prior.toUpperCase(), prior)).toBe(false);
  });
});
