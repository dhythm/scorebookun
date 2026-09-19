// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { gameReducer } from "@/lib/app-state/reducer";
import type { AppGame } from "@/lib/app-state/types";
import type { GameEvent, Player } from "@/lib/domain/types";
import { RunnerPlacementSheet } from "./runner-placement-sheet";

const lineup = (side: string): Player[] =>
  [1, 2, 3, 4].map((order) => ({
    id: `${side}-${order}`,
    name: `${side}${order}番`,
    order,
  }));

function createGame(events: GameEvent[] = []): AppGame {
  const game = gameReducer(null, {
    type: "LOAD_GAME",
    game: {
      id: "game",
      date: "2026-09-19T00:00:00.000Z",
      status: "live",
      config: {
        regulationInnings: 7,
        teams: {
          away: { name: "先攻", players: lineup("away") },
          home: { name: "後攻", players: lineup("home") },
        },
      },
      events,
    },
  });
  if (!game) throw new Error("Failed to create game");
  return game;
}

const out = (id: string, batterId: string): GameEvent => ({
  id,
  kind: "atBat",
  batterId,
  result: "strikeout",
  movements: [{ playerId: batterId, from: "batter", to: "out", isRBI: false }],
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(cleanup);

describe("runner placement sheet", () => {
  it("places the batters who precede the leadoff hitter for a tie-break", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    // Away's second batter leads off, so the first batter goes to first base
    // and the fourth batter, who hit before them, goes to second.
    render(
      <RunnerPlacementSheet
        game={createGame([out("o1", "away-1")])}
        onSubmit={onSubmit}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "タイブレーク（一・二塁）" })
    );
    await user.click(screen.getByRole("button", { name: "走者を配置" }));

    expect(onSubmit).toHaveBeenCalledWith({
      first: "away-1",
      second: "away-4",
      third: null,
    });
  });

  it("fills the bases for a bases-loaded tie-break", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RunnerPlacementSheet game={createGame()} onSubmit={onSubmit} />);

    await user.click(
      screen.getByRole("button", { name: "タイブレーク（満塁）" })
    );
    await user.click(screen.getByRole("button", { name: "走者を配置" }));

    expect(onSubmit).toHaveBeenCalledWith({
      first: "away-4",
      second: "away-3",
      third: "away-2",
    });
  });

  it("lets the scorer pick any runner for a base by hand", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<RunnerPlacementSheet game={createGame()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("combobox", { name: "3塁の走者" }));
    await user.click(screen.getByRole("option", { name: "away3番" }));
    await user.click(screen.getByRole("button", { name: "走者を配置" }));

    expect(onSubmit).toHaveBeenCalledWith({
      first: null,
      second: null,
      third: "away-3",
    });
  });

  it("refuses to put one runner on two bases", async () => {
    const user = userEvent.setup();
    render(<RunnerPlacementSheet game={createGame()} onSubmit={vi.fn()} />);

    for (const base of ["1塁の走者", "2塁の走者"]) {
      await user.click(screen.getByRole("combobox", { name: base }));
      await user.click(screen.getByRole("option", { name: "away3番" }));
    }

    expect(
      (screen.getByRole("button", { name: "走者を配置" }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });
});
