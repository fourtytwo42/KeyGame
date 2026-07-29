import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveGame } from "./live-game";

describe("LiveGame", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the literal game state before lore", () => {
    render(<LiveGame initialScenario="live" />);
    expect(screen.getByText("$89 POT")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "APE FOR THE BELL · $1" }),
    ).toBeEnabled();
    expect(screen.getAllByText("bellboy.eth").length).toBeGreaterThan(0);
  });

  it("lets a player pick a bag and enter the fixture round", () => {
    render(<LiveGame initialScenario="entry" />);
    fireEvent.click(screen.getByRole("button", { name: /AAPL/i }));
    const join = screen.getByRole("button", { name: "JOIN AAPL BAG · $1" });
    fireEvent.click(join);
    expect(
      screen.getByRole("button", { name: "APE FOR THE BELL · $1" }),
    ).toBeInTheDocument();
  });

  it("shows submitted state before accepting a simulated claim", () => {
    vi.useFakeTimers();
    render(<LiveGame initialScenario="live" />);
    fireEvent.click(
      screen.getByRole("button", { name: "APE FOR THE BELL · $1" }),
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
      screen.queryByRole("button", { name: "APE FOR THE BELL · $1" }),
    ).not.toBeInTheDocument();
  });
});
