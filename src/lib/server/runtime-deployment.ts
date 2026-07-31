import "server-only";

export function isDevnetRuntime() {
  return (
    Number(process.env.KEYGAME_CHAIN_ID) === 31337 ||
    process.env.NEXT_PUBLIC_GAME_MODE === "devnet"
  );
}

export function isV4DevnetRuntime() {
  return (
    isDevnetRuntime() &&
    process.env.NEXT_PUBLIC_CONTRACT_VERSION === "last-bell-v4-stock-pot"
  );
}

export function isV4Runtime() {
  return process.env.NEXT_PUBLIC_CONTRACT_VERSION === "last-bell-v4-stock-pot";
}
