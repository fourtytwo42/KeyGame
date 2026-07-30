import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveGame } from "./live-game";

vi.mock("@/lib/web3/use-wallet-game", () => ({
  useWalletGame: () => ({
    isConnected: false,
    session: null,
    claimable: { holderUsd: 0, airtimeUsd: 0, refundUsd: 0 },
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

  it("renders the literal market-reactive game state first", () => {
    render(<LiveGame initialScenario="live" />);
    expect(screen.getByText("$89 POT")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /PUT NVDA ON AIR · \$1/i }),
    ).toBeEnabled();
    expect(screen.getAllByText(/CLOSING PRINT CROWN/i)).toHaveLength(3);
  });

  it("turns the starter ticker into the first paid claim", () => {
    render(<LiveGame initialScenario="entry" />);
    expect(
      screen.getByText(/first \$1 call starts the 45-second broadcast clock/i),
    ).toBeInTheDocument();
    expect(screen.getByText("00:45")).toBeInTheDocument();
    expect(
      screen.getByText(/WAITING · FIRST \$1 STARTS IT/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /AAPL.*FLAT/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "ENTER WITH AAPL · $1" }),
    );
    expect(
      screen.getByRole("button", { name: /PUT NVDA ON AIR · \$1/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("$100").length).toBeGreaterThan(0);
    expect(screen.getAllByText("you.local").length).toBeGreaterThan(0);
  });

  it("shows submitted state before accepting a simulated ticker switch", () => {
    vi.useFakeTimers();
    render(<LiveGame initialScenario="live" />);
    fireEvent.click(
      screen.getByRole("button", { name: /PUT AAPL ON AIR · \$1/i }),
    );
    expect(
      screen.getAllByRole("button", { name: /CALLING…/i })[0],
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
      screen.queryByRole("button", { name: /PUT NVDA ON AIR · \$1/i }),
    ).not.toBeInTheDocument();
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
