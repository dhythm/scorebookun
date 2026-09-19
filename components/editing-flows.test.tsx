// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { gameReducer } from "@/lib/app-state/reducer";
import type { AppGame } from "@/lib/app-state/types";
import type { GameConfig, GameEvent } from "@/lib/domain/types";
import { AtBatResultDialog } from "./at-bat-result-dialog";
import { SubstitutionSheet } from "./substitution-sheet";

const updateEvent = vi.fn(() => ({
  accepted: true,
  violations: [],
  invalidatedEventIds: [],
}));
const dispatch = vi.fn(() => true);

vi.mock("@/lib/game-context", () => ({
  useGame: () => ({ updateEvent, dispatch }),
}));

const config: GameConfig = {
  regulationInnings: 7,
  teams: {
    away: {
      name: "先攻",
      players: [
        { id: "away-1", name: "先頭打者", order: 1 },
        { id: "away-2", name: "二番打者", order: 2 },
      ],
      benchPlayers: [{ id: "away-bench", name: "代打者", order: 10 }],
    },
    home: {
      name: "後攻",
      players: [{ id: "home-1", name: "相手打者", order: 1 }],
      benchPlayers: [{ id: "home-bench", name: "相手控え", order: 10 }],
    },
  },
};

const single: GameEvent = {
  id: "single",
  kind: "atBat",
  batterId: "away-1",
  result: "single",
  battedBall: { position: "left", type: "liner" },
  note: "左安",
  movements: [
    {
      playerId: "away-1",
      from: "batter",
      to: "first",
      isRBI: false,
    },
  ],
};

function createGame(events: GameEvent[]): AppGame {
  const game = gameReducer(null, {
    type: "LOAD_GAME",
    game: {
      id: "game",
      date: "2026-07-27T00:00:00.000Z",
      status: "live",
      config,
      events,
    },
  });
  if (!game) throw new Error("Failed to create game");
  return game;
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
  updateEvent.mockClear();
  dispatch.mockClear();
});

describe("editing UI flows", () => {
  it("recomputes movements when fly depth changes", async () => {
    const user = userEvent.setup();
    const game = createGame([
      {
        id: "triple",
        kind: "atBat",
        batterId: "away-1",
        result: "triple",
        movements: [
          {
            playerId: "away-1",
            from: "batter",
            to: "third",
            isRBI: false,
          },
        ],
      },
      {
        id: "fly",
        kind: "atBat",
        batterId: "away-2",
        result: "flyOut",
        note: "中飛",
        battedBall: {
          position: "center",
          type: "fly",
          depth: "shallow",
        },
        movements: [
          {
            playerId: "away-2",
            from: "batter",
            to: "out",
            isRBI: false,
          },
        ],
      },
    ]);
    render(
      <AtBatResultDialog
        game={game}
        open
        onOpenChange={vi.fn()}
        mode="edit"
        eventId="fly"
      />
    );

    await user.click(screen.getByRole("button", { name: "アウト" }));
    await user.click(screen.getByRole("button", { name: "フライ" }));
    await user.click(screen.getByRole("button", { name: "中" }));
    await user.click(screen.getByRole("button", { name: "深い" }));

    const home = await screen.findAllByRole("radio", { name: "ホーム" });
    expect(
      home.some((button) => button.getAttribute("data-state") === "on")
    ).toBe(true);
  });

  it("updates movements without changing the recorded result or note", async () => {
    const user = userEvent.setup();
    const game = createGame([single]);
    render(
      <AtBatResultDialog
        game={game}
        open
        onOpenChange={vi.fn()}
        mode="edit"
        eventId="single"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "進塁・打点だけ修正" })
    );
    await user.click(await screen.findByRole("radio", { name: "2塁" }));
    await user.click(screen.getByRole("button", { name: "確定" }));

    expect(updateEvent).toHaveBeenCalledWith(
      "single",
      expect.objectContaining({
        result: "single",
        note: "左安",
        movements: [
          {
            playerId: "away-1",
            from: "batter",
            to: "second",
            isRBI: false,
          },
        ],
      })
    );
  });

  it("requires confirmation before a movement edit invalidates a later event", async () => {
    const user = userEvent.setup();
    const game = createGame([
      single,
      {
        id: "steal",
        kind: "baseRunning",
        type: "steal",
        movements: [
          {
            playerId: "away-1",
            from: "first",
            to: "second",
            isRBI: false,
          },
        ],
      },
    ]);
    render(
      <AtBatResultDialog
        game={game}
        open
        onOpenChange={vi.fn()}
        mode="edit"
        eventId="single"
      />
    );

    await user.click(
      screen.getByRole("button", { name: "進塁・打点だけ修正" })
    );
    await user.click(await screen.findByRole("radio", { name: "2塁" }));
    await user.click(screen.getByRole("button", { name: "確定" }));

    expect(screen.getByText(/この修正で後続1件が無効になります/)).toBeTruthy();
    expect(updateEvent).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(updateEvent).toHaveBeenCalledTimes(1);
  });
});

describe("substitution UI", () => {
  it("puts the next pitcher in the pinch hitter's batting slot through ordinary substitution controls", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const positioned = structuredClone(config);
    positioned.teams.away.players[0].position = "pitcher";
    positioned.teams.away.startingPitcherId = "away-1";
    positioned.teams.away.benchPlayers!.push({
      id: "away-reliever",
      name: "救援投手",
      order: 11,
    });
    let game = gameReducer(null, {
      type: "LOAD_GAME",
      game: {
        id: "game",
        date: "2026-07-27T00:00:00.000Z",
        status: "live",
        config: positioned,
        events: [],
      },
    })!;
    const { rerender } = render(
      <SubstitutionSheet game={game} onSubmit={onSubmit} />
    );

    await user.click(screen.getByRole("combobox", { name: "退く選手" }));
    await user.click(screen.getByRole("option", { name: "先頭打者" }));
    await user.click(screen.getByRole("combobox", { name: "入る選手" }));
    await user.click(screen.getByRole("option", { name: "代打者" }));
    await user.click(screen.getByRole("button", { name: "交代を記録" }));
    game = gameReducer(game, {
      type: "ADD_EVENT",
      event: onSubmit.mock.calls[0][0],
    })!;
    rerender(<SubstitutionSheet game={game} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "守備位置変更" }));
    expect(
      screen.queryByRole("combobox", { name: "先頭打者の守備位置" })
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "投手交代" }));
    await user.click(screen.getByRole("combobox", { name: "退く選手" }));
    expect(screen.queryByRole("option", { name: "先頭打者" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "代打者" }));
    await user.click(screen.getByRole("combobox", { name: "入る選手" }));
    await user.click(screen.getByRole("option", { name: "救援投手" }));
    await user.click(screen.getByRole("button", { name: "交代を記録" }));

    game = gameReducer(game, {
      type: "ADD_EVENT",
      event: onSubmit.mock.calls[1][0],
    })!;
    expect(game.violations).toEqual([]);
    expect(game.currentState.activeLineup.away).toEqual([
      "away-reliever",
      "away-2",
    ]);
    expect(game.currentState.activePitcherId.away).toBe("away-reliever");
    expect(game.currentState.fieldingPositions.away).toEqual({
      "away-reliever": "pitcher",
    });
  });

  it("keeps pinch hitters on offense and submits the selected players", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SubstitutionSheet game={createGame([])} onSubmit={onSubmit} />);

    expect(
      (
        screen.getByRole("button", {
          name: "後攻・後攻",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);

    await user.click(screen.getByRole("combobox", { name: "退く選手" }));
    await user.click(screen.getByRole("option", { name: "先頭打者" }));
    await user.click(screen.getByRole("combobox", { name: "入る選手" }));
    await user.click(screen.getByRole("option", { name: "代打者" }));
    await user.click(screen.getByRole("button", { name: "交代を記録" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "substitution",
        team: "away",
        role: "pinchHitter",
        outPlayerId: "away-1",
        inPlayerId: "away-bench",
      })
    );
  });

  it("lets a fielder already in the lineup take the mound", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const positioned = structuredClone(config);
    positioned.teams.home.players = [
      { id: "home-1", name: "相手打者", order: 1, position: "pitcher" },
      { id: "home-2", name: "相手遊撃", order: 2, position: "short" },
    ];
    positioned.teams.home.startingPitcherId = "home-1";
    const game = gameReducer(null, {
      type: "LOAD_GAME",
      game: {
        id: "game",
        date: "2026-07-27T00:00:00.000Z",
        status: "live",
        config: positioned,
        events: [],
      },
    })!;
    render(<SubstitutionSheet game={game} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "守備位置変更" }));
    await user.click(screen.getByRole("button", { name: "後攻・後攻" }));
    await user.click(
      screen.getByRole("combobox", { name: "相手遊撃の守備位置" })
    );
    await user.click(screen.getByRole("option", { name: "投手 (P)" }));
    await user.click(
      screen.getByRole("combobox", { name: "相手打者の守備位置" })
    );
    await user.click(screen.getByRole("option", { name: "遊撃 (SS)" }));
    await user.click(screen.getByRole("button", { name: "守備位置を記録" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "positionChange",
        team: "home",
        changes: [
          { playerId: "home-1", position: "short" },
          { playerId: "home-2", position: "pitcher" },
        ],
      })
    );
  });

  it("adds a player who was not on the roster and selects them", async () => {
    const user = userEvent.setup();
    const onAddBenchPlayer = vi.fn(() => "new-id");
    render(
      <SubstitutionSheet
        game={createGame([])}
        onSubmit={vi.fn()}
        onAddBenchPlayer={onAddBenchPlayer}
      />
    );

    await user.type(
      screen.getByRole("textbox", { name: "新しい選手を追加" }),
      " 助っ人 "
    );
    await user.click(screen.getByRole("button", { name: "選手を追加" }));

    expect(onAddBenchPlayer).toHaveBeenCalledWith("away", "助っ人");
  });

  it("renames a player from the substitution sheet", async () => {
    const user = userEvent.setup();
    const onRenamePlayer = vi.fn();
    render(
      <SubstitutionSheet
        game={createGame([])}
        onSubmit={vi.fn()}
        onRenamePlayer={onRenamePlayer}
      />
    );

    await user.click(screen.getByRole("button", { name: "選手名の修正" }));
    await user.click(screen.getByRole("combobox", { name: "修正する選手" }));
    await user.click(screen.getByRole("option", { name: "二番打者" }));
    const input = screen.getByRole("textbox", { name: "正しい選手名" });
    await user.clear(input);
    await user.type(input, "鈴木");
    await user.click(screen.getByRole("button", { name: "選手名を保存" }));

    expect(onRenamePlayer).toHaveBeenCalledWith("away-2", "鈴木");
  });

  it("records the position a defensive substitute takes", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SubstitutionSheet game={createGame([])} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "守備交代" }));
    await user.click(screen.getByRole("combobox", { name: "退く選手" }));
    await user.click(screen.getByRole("option", { name: "先頭打者" }));
    await user.click(screen.getByRole("combobox", { name: "入る選手" }));
    await user.click(screen.getByRole("option", { name: "代打者" }));
    await user.click(
      screen.getByRole("combobox", { name: "入る選手の守備位置" })
    );
    await user.click(screen.getByRole("option", { name: "左翼 (LF)" }));
    await user.click(screen.getByRole("button", { name: "交代を記録" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ role: "fielder", position: "left" })
    );
  });
});
