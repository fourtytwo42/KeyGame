import "server-only";

type Runtime = typeof import("./v4-devnet");

export type V4DevnetAction = import("./v4-devnet").V4DevnetAction;

const unavailable = () =>
  Promise.reject(
    new Error("Devnet transaction facilities are absent from this build."),
  );

export const getV4DevnetSnapshot =
  unavailable as Runtime["getV4DevnetSnapshot"];
export const getV4DevnetSession = unavailable as Runtime["getV4DevnetSession"];
export const getV4DevnetRewards = unavailable as Runtime["getV4DevnetRewards"];
export const quoteV4Devnet = unavailable as Runtime["quoteV4Devnet"];
export const sendV4DevnetAction = unavailable as Runtime["sendV4DevnetAction"];
export const ensureV4DevnetRoundProgression =
  unavailable as Runtime["ensureV4DevnetRoundProgression"];
