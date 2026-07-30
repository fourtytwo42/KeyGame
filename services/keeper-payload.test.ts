import { describe, expect, it } from "vitest";
import {
  hydrateRoundSettings,
  persistRoundSettings,
} from "./keeper-payload";

describe("keeper round settings persistence", () => {
  it("serializes and restores every uint256 field without precision loss", () => {
    const persisted = persistRoundSettings({
      roundId: 9_007_199_254_740_993n,
      claimPrice: 1_000_000n,
      startDuration: 45,
      producerPassRequired: false,
    });

    expect(() => JSON.stringify(persisted)).not.toThrow();
    expect(hydrateRoundSettings(persisted)).toEqual({
      roundId: 9_007_199_254_740_993n,
      claimPrice: 1_000_000n,
      startDuration: 45,
      producerPassRequired: false,
    });
  });
});
