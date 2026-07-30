import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { readUatNativeGrant } from "./uat-grant";

describe("UAT native grant", () => {
  it("defaults to a small gas-only grant", () => {
    expect(readUatNativeGrant()).toBe(parseEther("0.0001"));
  });

  it("rejects empty and oversized grants", () => {
    expect(() => readUatNativeGrant("0")).toThrow(/safety cap/);
    expect(() => readUatNativeGrant("0.0011")).toThrow(/safety cap/);
  });
});
