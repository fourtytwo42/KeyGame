import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveGame } from "./live-game";

vi.mock("@/lib/web3/use-wallet-game", () => ({
  useWalletGame: () => ({
    isConnected: false,
    session: null,
    claimable: { holderUsd: 0, airtimeUsd: 0, refundUsd: 0 },
    action: "idle",
    latestApprovalHash: null,
    latestContributionHash: null,
    enter: vi.fn(),
    claim: vi.fn(),
    revoke: vi.fn(),
    claimReward: vi.fn(),
  }),
}));

describe("LiveGame", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the variable-amount stock-pot game state first", () => {
    render(<LiveGame initialScenario="live" />);
    expect(screen.getByText("$89")).toBeInTheDocument();
    expect(screen.getByText("YOUR NVDA CALL")).toBeInTheDocument();
    expect(screen.getByText("IF ACCEPTED")).toBeInTheDocument();
    expect(screen.queryByText(/QUOTE FLOOR/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /APE \$10 ON NVDA/i }),
    ).toBeEnabled();
    expect(screen.getByText(/#1 STOCK · 30%/i)).toBeInTheDocument();
  });

  it("turns the starter ticker into the first paid claim", () => {
    render(<LiveGame initialScenario="entry" />);
    expect(screen.getByText("BELL CLOCK")).toBeInTheDocument();
    expect(screen.getByText("05:00")).toBeInTheDocument();
    expect(screen.getByText(/WAITING FOR FIRST CALL/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AAPL" }));
    fireEvent.click(screen.getByRole("button", { name: "APE $10 ON AAPL" }));
    expect(
      screen.getByRole("button", { name: /APE \$10 ON AAPL/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("$100").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /APE \$10 ON AAPL/i }),
    ).toBeInTheDocument();
  });

  it("shows submitted state before accepting a simulated ticker switch", () => {
    vi.useFakeTimers();
    render(<LiveGame initialScenario="live" />);
    fireEvent.click(screen.getByRole("button", { name: "AAPL" }));
    fireEvent.click(screen.getByRole("button", { name: /APE \$10 ON AAPL/i }));
    expect(
      screen.getByRole("button", { name: /APE \$10 ON AAPL/i }),
    ).toBeDisabled();
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getAllByText("you.local").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
  });

  it("disables value actions when the feed is offline", () => {
    render(<LiveGame initialScenario="dead-air" />);
    expect(
      screen.getByRole("heading", { name: "Dead air" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /APE \$10 ON NVDA/i }),
    ).not.toBeInTheDocument();
  });

  it("labels a delayed LAN signal as connection degraded and pauses actions", () => {
    render(<LiveGame initialScenario="stale-data" />);
    const action = screen.getByRole("button", { name: /APE \$10 ON NVDA/i });
    expect(action).toBeDisabled();
    expect(action).toHaveTextContent("CONNECTION DEGRADED");
  });

  it("keeps a healthy current round actionable without a duplicate RPC label", () => {
    render(<LiveGame initialScenario="entry" />);
    expect(screen.queryByText("LAN RPC LIVE")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /APE \$10 ON NVDA/i }),
    ).toBeEnabled();
  });

  it("keeps receipt and replay actions out of the final transmission", () => {
    render(<LiveGame initialScenario="settled" />);
    expect(
      screen.queryByRole("link", { name: /GET THE RECEIPT/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /REPLAY THE CHAOS/i }),
    ).not.toBeInTheDocument();
  });
});
