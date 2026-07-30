import { parseEther } from "viem";

const DEFAULT_NATIVE_GRANT = "0.0001";
const MAX_NATIVE_GRANT = parseEther("0.001");

export function readUatNativeGrant(value?: string) {
  const grant = parseEther(value ?? DEFAULT_NATIVE_GRANT);
  if (grant <= 0n || grant > MAX_NATIVE_GRANT) {
    throw new Error("The configured UAT native grant exceeds the safety cap.");
  }
  return grant;
}
