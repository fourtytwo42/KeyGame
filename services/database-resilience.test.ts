import { describe, expect, it, vi } from "vitest";
import {
  isTransientDatabaseError,
  waitForDatabaseRecovery,
} from "./database-resilience";

describe("database resilience", () => {
  it("classifies PostgreSQL shutdown and socket interruption errors", () => {
    expect(isTransientDatabaseError({ code: "57P01" })).toBe(true);
    expect(
      isTransientDatabaseError(new Error("Connection terminated unexpectedly")),
    ).toBe(true);
    expect(isTransientDatabaseError(new Error("constraint violation"))).toBe(
      false,
    );
  });

  it("waits through transient disconnects and then resumes", async () => {
    const probe = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce({ code: "57P01" })
      .mockRejectedValueOnce(new Error("Connection terminated unexpectedly"))
      .mockResolvedValue();

    await waitForDatabaseRecovery(probe, "test controller", 0);

    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("does not hide non-transient database failures", async () => {
    const failure = new Error("invalid query");
    await expect(
      waitForDatabaseRecovery(() => Promise.reject(failure), "test", 0),
    ).rejects.toBe(failure);
  });
});
