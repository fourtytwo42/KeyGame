export function raidThreshold(eligibleVoters: number, override?: number) {
  if (override && override > 0) {
    return Math.max(1, Math.min(override, Math.max(eligibleVoters, 1)));
  }
  const adaptive = Math.min(25, Math.max(3, Math.ceil(eligibleVoters * 0.2)));
  return Math.max(1, Math.min(adaptive, Math.max(eligibleVoters, 1)));
}
