// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { gameReducer } from "@/lib/app-state/reducer";
import type { GameEvent } from "@/lib/domain/types";
import { RunnerAdvanceSheet } from "./runner-advance-sheet";

afterEach(cleanup);

describe("walk-off scoring preview", () => {
  it("shows the same winning run before and after confirmation", async () => {
    const user = userEvent.setup();
    const events: GameEvent[] = [1, 2, 3].map((index) => ({
      id: `out-${index}`,
      kind: "atBat",
      batterId: "away",
      result: "strikeout",
      movements: [
        { playerId: "away", from: "batter", to: "out", isRBI: false },
      ],
    }));
    events.push({
      id: "loaded-bases",
      kind: "runnerPlacement",
      runners: { third: "home-2", second: "home-3", first: "home-4" },
    });
    const game = gameReducer(null, {
      type: "LOAD_GAME",
      game: {
        id: "preview",
        date: "2026-09-20T00:00:00.000Z",
        status: "live",
        config: {
          regulationInnings: 1,
          teams: {
            away: {
              name: "先攻",
              players: [{ id: "away", name: "相手", order: 1 }],
            },
            home: {
              name: "後攻",
              players: ["打者", "三塁走者", "二塁走者", "一塁走者"].map(
                (name, index) => ({
                  id: `home-${index + 1}`,
                  name,
                  order: index + 1,
                })
              ),
            },
          },
        },
        events,
      },
    })!;
    const onConfirm = vi.fn();
    render(
      <RunnerAdvanceSheet
        game={game}
        result="single"
        detail="中安"
        open
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText("得点:").parentElement?.textContent).toBe(
      "得点:+1(三塁走者)"
    );
    await user.click(screen.getByRole("button", { name: "確定" }));
    const [movements, , previewRuns] = onConfirm.mock.calls[0];
    const confirmed = gameReducer(game, {
      type: "ADD_EVENT",
      event: {
        id: "hit",
        kind: "atBat",
        batterId: "home-1",
        result: "single",
        movements,
      },
    })!;
    expect(previewRuns).toBe(1);
    expect(confirmed.currentState.score.home).toBe(previewRuns);
    expect(
      confirmed.timeline
        .at(-1)!
        .scoringMovements.map(({ playerId }) => playerId)
    ).toEqual(["home-2"]);
  });
});
