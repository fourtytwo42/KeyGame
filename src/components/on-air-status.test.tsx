import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnAirStatus } from "./on-air-status";

describe("OnAirStatus", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the Bell Live badge for a healthy LAN RPC", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ rpc: { connectionStatus: "healthy" } }),
      }),
    );
    render(<OnAirStatus />);
    expect(await screen.findByText("BELL LIVE")).toBeInTheDocument();
    expect(screen.getByLabelText("LAN RPC healthy")).toBeInTheDocument();
  });

  it("turns the badge into the degraded warning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ rpc: { connectionStatus: "degraded" } }),
      }),
    );
    render(<OnAirStatus />);
    expect(await screen.findByText("CONNECTION DEGRADED")).toBeInTheDocument();
    expect(screen.getByLabelText("LAN RPC degraded")).toBeInTheDocument();
  });
});
