import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveGame } from "./live-game";

vi.mock("@/lib/web3/use-wallet-game", () => ({
  useWalletGame: () => ({
    isConnected: false,
    session: null,
    claimable: { holderUsd: 0, factionUsd: 0, refundUsd: 0 },
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

  it("renders the literal game state before lore", () => {
    render(<LiveGame initialScenario="live" />);
    expect(screen.getByText("$89 POT")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "SEND IT FOR THE BELL · $1" }),
    ).toBeEnabled();
    expect(screen.getAllByText("bellboy.eth").length).toBeGreaterThan(0);
  });

  it("lets a player choose a faction with one reusable approval", () => {
    render(<LiveGame initialScenario="entry" />);
    fireEvent.click(screen.getByRole("button", { name: /AAPL/i }));
    fireEvent.click(screen.getByRole("button", { name: "ENTER AAPL" }));
    expect(
      screen.getByRole("button", { name: "SEND IT FOR THE BELL · $1" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("$100").length).toBeGreaterThan(0);
  });

  it("shows submitted state before accepting a simulated claim", () => {
    vi.useFakeTimers();
    render(<LiveGame initialScenario="live" />);
    fireEvent.click(
      screen.getByRole("button", { name: "SEND IT FOR THE BELL · $1" }),
    );
    expect(
      screen.getByRole("button", { name: "CALLING THE CHAIN…" }),
    ).toBeDisabled();
    act(() => vi.advanceTimersByTime(500));
    expect(
      screen.getByRole("button", { name: "YOU HAVE THE BELL" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("you.local").length).toBeGreaterThan(0);
  });

  it("disables value actions when the feed is offline", () => {
    render(<LiveGame initialScenario="dead-air" />);
    expect(
      screen.getByRole("heading", { name: "Dead air" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "SEND IT FOR THE BELL · $1" }),
    ).not.toBeInTheDocument();
  });
});
