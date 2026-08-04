import { describe, expect, it } from "vitest";
import { leaderboardRewardQueryScope } from "./leaderboard-query";

describe("leaderboard reward query scope", () => {
  it("keeps round id and mock mode on distinct typed parameters", () => {
    expect(
      leaderboardRewardQueryScope("round", "deployment", "6", true),
    ).toEqual({
      condition: "AND rc.round_id=$2",
      mockParameter: "$3",
      params: ["deployment", "6", true],
    });
  });

  it.each(["season", "lifetime"] as const)(
    "does not leave an untyped parameter gap for %s scope",
    (scope) => {
      const query = leaderboardRewardQueryScope(
        scope,
        "deployment",
        "6",
        false,
      );
      expect(query.mockParameter).toBe("$2");
      expect(query.params).toEqual(["deployment", false]);
      expect(query.condition).not.toContain("$2");
    },
  );
});
