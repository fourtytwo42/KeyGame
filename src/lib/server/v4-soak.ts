export function isCompletedRollover(
  phase: number,
  activeRound: string,
  priorRound: string,
) {
  return (
    (phase === 4 || phase === 5) &&
    activeRound.toLowerCase() !== priorRound.toLowerCase()
  );
}
