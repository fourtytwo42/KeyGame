export function leaderboardRewardQueryScope(
  scope: "round" | "season" | "lifetime",
  deploymentKey: string,
  currentRound: string | undefined,
  mockOnly: boolean,
) {
  if (scope === "round") {
    return {
      condition: "AND rc.round_id=$2",
      mockParameter: "$3",
      params: [deploymentKey, currentRound ?? "-1", mockOnly],
    };
  }
  return {
    condition:
      scope === "season"
        ? "AND r.settled_at >= date_trunc('month',now() AT TIME ZONE 'UTC')"
        : "",
    mockParameter: "$2",
    params: [deploymentKey, mockOnly],
  };
}
