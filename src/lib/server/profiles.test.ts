import { describe, expect, it } from "vitest";
import { validateProfile } from "@/lib/game/profile-validation";

describe("profile validation", () => {
  it("normalizes a valid handle and ticker", () => {
    expect(
      validateProfile({
        handle: "Bell_Caller",
        displayName: "Bell Caller",
        favoriteTicker: "nvda",
      }),
    ).toEqual({
      handle: "bell_caller",
      displayName: "Bell Caller",
      favoriteTicker: "NVDA",
    });
  });

  it("rejects Unicode-confusable handles by allowing ASCII only", () => {
    expect(() =>
      validateProfile({
        handle: "аdmin",
        displayName: "Caller",
      }),
    ).toThrow(/lowercase letters/);
  });

  it("rejects reserved and impersonating names", () => {
    expect(() =>
      validateProfile({
        handle: "support",
        displayName: "Caller",
      }),
    ).toThrow(/reserved/);
    expect(() =>
      validateProfile({
        handle: "normalcaller",
        displayName: "SavedByTheBell Official",
      }),
    ).toThrow(/cannot be used/);
  });
});
