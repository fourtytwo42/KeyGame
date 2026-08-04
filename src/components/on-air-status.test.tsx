import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnAirStatus } from "./on-air-status";

describe("OnAirStatus", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the existing ON AIR badge for a healthy LAN RPC", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ rpc: { connectionStatus: "healthy" } }),
      }),
    );
    render(<OnAirStatus />);
    expect(await screen.findByText("ON AIR")).toBeInTheDocument();
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
    expect(await screen.findByText("DEGRADED")).toBeInTheDocument();
    expect(screen.getByLabelText("LAN RPC degraded")).toBeInTheDocument();
  });
});
