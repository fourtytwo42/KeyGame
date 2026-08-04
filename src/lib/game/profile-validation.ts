const reserved = new Set([
  "admin",
  "administrator",
  "lastbell",
  "last_bell",
  "savedbythebell",
  "saved_by_the_bell",
  "moderator",
  "official",
  "robinhood",
  "support",
  "treasury",
]);
const blockedFragments = ["fuck", "shit", "nigger", "cunt"];

export function validateProfile(input: {
  handle?: unknown;
  displayName?: unknown;
  favoriteTicker?: unknown;
}) {
  const handle = String(input.handle ?? "")
    .trim()
    .toLowerCase();
  const displayName = String(input.displayName ?? "").trim();
  const favoriteTicker = input.favoriteTicker
    ? String(input.favoriteTicker).trim().toUpperCase()
    : undefined;
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) {
    throw new Error(
      "Handle must be 3–20 lowercase letters, numbers, or underscores.",
    );
  }
  if (
    reserved.has(handle) ||
    blockedFragments.some((word) => handle.includes(word))
  ) {
    throw new Error("That handle is reserved.");
  }
  if (!displayName || [...displayName].length > 24) {
    throw new Error("Display name must be 1–24 characters.");
  }
  const normalizedDisplay = displayName
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (
    reserved.has(normalizedDisplay) ||
    [...reserved].some(
      (name) =>
        name.length >= 5 && normalizedDisplay.includes(name.replace(/_/g, "")),
    ) ||
    blockedFragments.some((word) => normalizedDisplay.includes(word))
  ) {
    throw new Error("That display name cannot be used.");
  }
  if (favoriteTicker && !/^[A-Z0-9.]{1,8}$/.test(favoriteTicker)) {
    throw new Error("Favorite ticker is invalid.");
  }
  return { handle, displayName, favoriteTicker };
}
