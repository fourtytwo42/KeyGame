import { describe, expect, it } from "vitest";
import { raidThreshold } from "@/lib/game/raid-config";

describe("raid thresholds", () => {
  it("uses twenty percent with three and twenty-five voter clamps", () => {
    expect(raidThreshold(10)).toBe(3);
    expect(raidThreshold(100)).toBe(20);
    expect(raidThreshold(1_000)).toBe(25);
  });

  it("never exceeds the eligible population", () => {
    expect(raidThreshold(1)).toBe(1);
    expect(raidThreshold(2)).toBe(2);
  });

  it("supports deterministic non-production UAT overrides", () => {
    expect(raidThreshold(10, 2)).toBe(2);
    expect(raidThreshold(1, 2)).toBe(1);
  });
});
