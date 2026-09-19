// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { gameReducer } from "@/lib/app-state/reducer";
import type { AppGame } from "@/lib/app-state/types";
import type { GameConfig, GameEvent } from "@/lib/domain/types";
import { GameProvider, useGame } from "@/lib/game-context";
import { AtBatResultFlow } from "./at-bat-result-flow";
import { BaseRunningEventSheet } from "./base-running-event-sheet";
import { DiamondField } from "./diamond-field";
import { GameNoteDialog } from "./game-note-dialog";
import { LiveScoring } from "./live-scoring";
import { Scoreboard } from "./scoreboard";
import { UiPreferencesProvider } from "./ui-preferences-provider";

const config: GameConfig = {
  regulationInnings: 7,
  teams: {
    away: {
      name: "先攻",
      players: [
        { id: "away-1", name: "先頭打者", order: 1 },
        { id: "away-2", name: "二番打者", order: 2 },
      ],
    },
    home: {
      name: "後攻",
      players: [{ id: "home-1", name: "相手打者", order: 1 }],
    },
  },
};

const runnerOnFirst: GameEvent = {
  id: "single",
  kind: "atBat",
  batterId: "away-1",
  result: "single",
  movements: [
    {
      playerId: "away-1",
      from: "batter",
      to: "first",
      isRBI: false,
    },
  ],
};

const runnersOnFirstAndSecond: GameEvent[] = [
  runnerOnFirst,
  {
    id: "second-single",
    kind: "atBat",
    batterId: "away-2",
    result: "single",
    movements: [
      {
        playerId: "away-1",
        from: "first",
        to: "second",
        isRBI: false,
      },
      {
        playerId: "away-2",
        from: "batter",
        to: "first",
        isRBI: false,
      },
    ],
  },
];

function createGame(events: GameEvent[]): AppGame {
  const game = gameReducer(null, {
    type: "LOAD_GAME",
    game: {
      id: "game",
      date: "2026-07-26T00:00:00.000Z",
      status: "live",
      config,
      events,
    },
  });
  if (!game) throw new Error("Failed to create test game");
  return game;
}

afterEach(cleanup);

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function LiveGameHarness() {
  const { game, dispatch } = useGame();

  useEffect(() => {
    dispatch({
      type: "START_GAME",
      id: "live-flow",
      date: "2026-07-26T00:00:00.000Z",
      config,
    });
  }, [dispatch]);

  return game ? <LiveScoring /> : null;
}

describe("scoring UI flows", () => {
  it("records a generic strikeout directly from the first result screen", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AtBatResultFlow resetToken={0} outs={0} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "三振" }));

    expect(onSubmit).toHaveBeenCalledWith("strikeout");
  });

  it("asks for fly depth only when a runner can tag up", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AtBatResultFlow
        resetToken={0}
        outs={0}
        hasTagUpCandidate
        onSubmit={onSubmit}
      />
    );

    await user.click(screen.getByRole("button", { name: "アウト" }));
    await user.click(screen.getByRole("button", { name: "フライ" }));
    await user.click(screen.getByRole("button", { name: "中" }));
    expect(screen.getByRole("button", { name: "浅い" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "深い" }));

    expect(onSubmit).toHaveBeenCalledWith("flyOut", "中飛", {
      position: "center",
      type: "fly",
      depth: "deep",
    });
  });

  it("disables double-play input without a runner on first", async () => {
    const user = userEvent.setup();
    render(
      <AtBatResultFlow
        resetToken={0}
        outs={0}
        canRecordDoublePlay={false}
        onSubmit={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "アウト" }));

    expect(
      (
        screen.getByRole("button", {
          name: /併殺打.*一塁走者なし/,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it("preselects the only runner and the conventional next base", async () => {
    const user = userEvent.setup();
    const onEvent = vi.fn();
    render(
      <BaseRunningEventSheet
        game={createGame([runnerOnFirst])}
        onEvent={onEvent}
      />
    );

    const nextBase = await screen.findByRole("radio", { name: "2塁" });
    await waitFor(() => expect(nextBase.getAttribute("data-state")).toBe("on"));
    await user.click(screen.getByRole("button", { name: "走塁を記録" }));

    expect(onEvent).toHaveBeenCalledWith({
      type: "steal",
      movements: [
        {
          playerId: "away-1",
          from: "first",
          to: "second",
          isRBI: false,
        },
      ],
    });
  });

  it("preselects only the requested runner and their conventional next base", async () => {
    const user = userEvent.setup();
    const onEvent = vi.fn();
    render(
      <BaseRunningEventSheet
        game={createGame(runnersOnFirstAndSecond)}
        initialRunnerId="away-1"
        onEvent={onEvent}
      />
    );

    const requestedRunner = screen.getByRole("checkbox", {
      name: "2塁・先頭打者",
    });
    const otherRunner = screen.getByRole("checkbox", {
      name: "1塁・二番打者",
    });
    await waitFor(() =>
      expect(requestedRunner.getAttribute("data-state")).toBe("checked")
    );
    expect(otherRunner.getAttribute("data-state")).toBe("unchecked");
    expect(
      screen.getByRole("radio", { name: "3塁" }).getAttribute("data-state")
    ).toBe("on");

    await user.click(screen.getByRole("button", { name: "走塁を記録" }));

    expect(onEvent).toHaveBeenCalledWith({
      type: "steal",
      movements: [
        {
          playerId: "away-1",
          from: "second",
          to: "third",
          isRBI: false,
        },
      ],
    });
  });

  it("sets a conventional destination for every runner in a double steal", async () => {
    const user = userEvent.setup();
    const onEvent = vi.fn();
    render(
      <BaseRunningEventSheet
        game={createGame(runnersOnFirstAndSecond)}
        onEvent={onEvent}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "1塁・二番打者" }));
    await user.click(screen.getByRole("checkbox", { name: "2塁・先頭打者" }));
    await user.click(screen.getByRole("button", { name: "走塁を記録" }));

    expect(onEvent).toHaveBeenCalledWith({
      type: "steal",
      movements: [
        {
          playerId: "away-2",
          from: "first",
          to: "second",
          isRBI: false,
        },
        {
          playerId: "away-1",
          from: "second",
          to: "third",
          isRBI: false,
        },
      ],
    });
  });

  it("records one runner safe and another out in the same base-running play", async () => {
    const user = userEvent.setup();
    const onEvent = vi.fn();
    render(
      <BaseRunningEventSheet
        game={createGame(runnersOnFirstAndSecond)}
        onEvent={onEvent}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: "2塁・先頭打者" }));
    await user.click(screen.getByRole("checkbox", { name: "1塁・二番打者" }));
    // Runner cards are listed from first base up.
    await user.click(screen.getAllByRole("radio", { name: "アウト" })[0]);
    await user.click(screen.getByRole("button", { name: "走塁を記録" }));

    expect(onEvent).toHaveBeenCalledWith({
      type: "steal",
      movements: [
        { playerId: "away-1", from: "second", to: "third", isRBI: false },
        { playerId: "away-2", from: "first", to: "out", isRBI: false },
      ],
    });
  });

  it("records an advance that is none of the named base-running plays", async () => {
    const user = userEvent.setup();
    const onEvent = vi.fn();
    render(
      <BaseRunningEventSheet
        game={createGame([runnerOnFirst])}
        onEvent={onEvent}
      />
    );

    await user.click(screen.getByRole("button", { name: "その他の進塁" }));
    await user.click(screen.getByRole("radio", { name: "3塁" }));
    await user.click(screen.getByRole("button", { name: "走塁を記録" }));

    expect(onEvent).toHaveBeenCalledWith({
      type: "otherAdvance",
      movements: [
        { playerId: "away-1", from: "first", to: "third", isRBI: false },
      ],
    });
  });

  it("defaults a running out to out for the selected runner", async () => {
    const user = userEvent.setup();
    const onEvent = vi.fn();
    render(
      <BaseRunningEventSheet
        game={createGame([runnerOnFirst])}
        onEvent={onEvent}
      />
    );

    await user.click(screen.getByRole("button", { name: "走塁死" }));
    await user.click(screen.getByRole("button", { name: "走塁を記録" }));

    expect(onEvent).toHaveBeenCalledWith({
      type: "otherOut",
      movements: [
        { playerId: "away-1", from: "first", to: "out", isRBI: false },
      ],
    });
  });

  it("opens runner input from an occupied base with a touch-sized button", async () => {
    const user = userEvent.setup();
    const onRunnerSelect = vi.fn();
    const game = createGame(runnersOnFirstAndSecond);
    render(
      <DiamondField
        game={game}
        runners={game.currentState.runners}
        onRunnerSelect={onRunnerSelect}
      />
    );

    const secondBaseRunner = screen.getByRole("button", {
      name: "2塁走者 先頭打者 の走塁を入力",
    });
    expect(secondBaseRunner.className).toContain("min-h-11");
    expect(secondBaseRunner.className).toContain("min-w-11");

    await user.click(secondBaseRunner);

    expect(onRunnerSelect).toHaveBeenCalledWith("away-1");
    expect(screen.queryByRole("button", { name: /3塁走者/ })).toBeNull();
  });

  it("trims and records a lightweight game note", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(() => true);
    const onOpenChange = vi.fn();
    render(
      <GameNoteDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} />
    );

    const submitButton = screen.getByRole("button", { name: "メモを記録" });
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    await user.type(
      screen.getByRole("textbox", { name: "試合メモ" }),
      "  雨天中断  "
    );
    await user.click(submitButton);

    expect(onSubmit).toHaveBeenCalledWith("雨天中断");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("expands the compact live scoreboard on demand", async () => {
    const user = userEvent.setup();
    render(<Scoreboard game={createGame([])} collapsibleOnMobile />);

    await user.click(
      screen.getByRole("button", { name: "スコアボードを展開" })
    );

    expect(
      screen.getByRole("button", { name: "スコアボードを折りたたむ" })
    ).toBeTruthy();
  });

  it("records a selected result through live scoring and shows it in the batting order", async () => {
    const user = userEvent.setup();
    render(
      <UiPreferencesProvider>
        <GameProvider>
          <LiveGameHarness />
        </GameProvider>
      </UiPreferencesProvider>
    );

    await user.click(await screen.findByRole("button", { name: "結果入力" }));
    await user.click(await screen.findByRole("button", { name: "三振" }));

    expect(
      await screen.findAllByRole("button", {
        name: "1回の記録 三振を修正",
      })
    ).not.toHaveLength(0);
  });
});
