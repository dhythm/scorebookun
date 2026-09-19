import { describe, expect, it } from "vitest";

import type { GameEvent, Team } from "../domain/types";
import type { PersistedGameV2 } from "../storage/local-storage";
import {
  evaluateEventDeletion,
  evaluateEventUpdate,
  gameReducer,
} from "./reducer";
import {
  getCurrentBatter,
  getFieldingPositionHistory,
  getNextBatter,
  getTimelineEntry,
  toPersistedGame,
} from "./selectors";
import type { GameAction } from "./types";

const team = (side: string): Team => ({
  name: side,
  players: [
    { id: `${side}-1`, name: `${side} 1`, order: 1 },
    { id: `${side}-2`, name: `${side} 2`, order: 2 },
  ],
});

const persistedGame = (
  events: GameEvent[] = [],
  status: PersistedGameV2["status"] = "live"
): PersistedGameV2 => ({
  id: "game-1",
  date: "2026-07-26T00:00:00.000Z",
  status,
  config: {
    regulationInnings: 7,
    teams: { away: team("away"), home: team("home") },
  },
  events,
});

const out = (id: string, batterId: string): GameEvent => ({
  id,
  kind: "atBat",
  batterId,
  result: "groundOut",
  movements: [{ playerId: batterId, from: "batter", to: "out", isRBI: false }],
});

const homeRun = (id: string, batterId: string): GameEvent => ({
  id,
  kind: "atBat",
  batterId,
  result: "homerun",
  movements: [{ playerId: batterId, from: "batter", to: "home", isRBI: true }],
});

function reduce(actions: GameAction[]) {
  return actions.reduce(gameReducer, null);
}

describe("app-state gameReducer", () => {
  it("supports multiple undo and redo operations", () => {
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame(),
    });
    const first = gameReducer(loaded, {
      type: "ADD_EVENT",
      event: out("first", "away-1"),
    });
    const second = gameReducer(first, {
      type: "ADD_EVENT",
      event: out("second", "away-2"),
    });
    const undoSecond = gameReducer(second, { type: "UNDO_LAST_EVENT" });
    const undoFirst = gameReducer(undoSecond, { type: "UNDO_LAST_EVENT" });
    const redoFirst = gameReducer(undoFirst, { type: "REDO_LAST_EVENT" });
    const redoSecond = gameReducer(redoFirst, { type: "REDO_LAST_EVENT" });

    expect(undoFirst?.events).toEqual([]);
    expect(redoFirst?.events.map(({ id }) => id)).toEqual(["first"]);
    expect(redoSecond?.events.map(({ id }) => id)).toEqual(["first", "second"]);
  });

  it("keeps at most twenty undo revisions", () => {
    let state = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame(),
    });
    for (let index = 0; index < 25; index += 1) {
      state = gameReducer(state, {
        type: "ADD_EVENT",
        event: {
          id: `note-${index}`,
          kind: "note",
          text: `note ${index}`,
        },
      });
    }
    expect(state?.undoHistory).toHaveLength(20);
  });

  it("moves a deleted event to trash and restores it at its original position", () => {
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([out("first", "away-1"), out("second", "away-2")]),
    });
    const deleted = gameReducer(loaded, {
      type: "DELETE_EVENT",
      eventId: "first",
    });
    const restored = gameReducer(deleted, {
      type: "RESTORE_DELETED_EVENT",
      eventId: "first",
    });

    expect(deleted?.deletedEvents).toMatchObject([
      { event: { id: "first" }, index: 0 },
    ]);
    expect(restored?.events.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(restored?.deletedEvents).toEqual([]);
  });

  it("returns to the beginning of the current half inning as one undoable operation", () => {
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([
        out("away-1", "away-1"),
        out("away-2", "away-2"),
        out("away-3", "away-1"),
        out("home-1", "home-1"),
      ]),
    });
    const restored = gameReducer(loaded, {
      type: "RESTORE_HALF_INNING_START",
    });
    const undone = gameReducer(restored, { type: "UNDO_LAST_EVENT" });

    expect(restored?.events.map(({ id }) => id)).toEqual([
      "away-1",
      "away-2",
      "away-3",
    ]);
    expect(restored?.currentState).toMatchObject({
      inning: 1,
      half: "bottom",
      outs: 0,
    });
    expect(undone?.events.map(({ id }) => id)).toEqual([
      "away-1",
      "away-2",
      "away-3",
      "home-1",
    ]);
  });

  it("starts a game and derives an empty replay view", () => {
    const state = gameReducer(null, {
      type: "START_GAME",
      id: "started",
      date: "2026-07-26T01:00:00.000Z",
      config: persistedGame().config,
    });

    expect(state).toMatchObject({
      id: "started",
      status: "live",
      manualEnded: false,
      events: [],
      currentState: {
        inning: 1,
        half: "top",
        outs: 0,
      },
      timeline: [],
      violations: [],
    });
  });

  it("adds input-only events and derives state and timeline", () => {
    const state = reduce([
      { type: "LOAD_GAME", game: persistedGame() },
      { type: "ADD_EVENT", event: out("out-1", "away-1") },
    ]);

    expect(state?.events).toEqual([out("out-1", "away-1")]);
    expect(state?.currentState.outs).toBe(1);
    expect(state?.timeline[0]).toMatchObject({
      inning: 1,
      half: "top",
      outsRecorded: 1,
      applied: true,
    });
  });

  it("replaces an event and replays every derived value", () => {
    const state = reduce([
      { type: "LOAD_GAME", game: persistedGame([out("play", "away-1")]) },
      {
        type: "UPDATE_EVENT",
        eventId: "play",
        event: homeRun("ignored-replacement-id", "away-1"),
      },
    ]);

    expect(state?.events[0]).toEqual(homeRun("play", "away-1"));
    expect(state?.currentState).toMatchObject({
      outs: 0,
      score: { away: 1, home: 0 },
    });
    expect(state?.timeline[0].runsScored).toBe(1);
  });

  it("deletes and undoes events by replaying the remaining inputs", () => {
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([out("first", "away-1"), out("second", "away-2")]),
    });
    const deleted = gameReducer(loaded, {
      type: "DELETE_EVENT",
      eventId: "first",
    });
    const undone = gameReducer(deleted, { type: "UNDO_LAST_EVENT" });

    expect(deleted?.events.map(({ id }) => id)).toEqual(["second"]);
    expect(deleted?.currentState.outs).toBe(1);
    expect(undone?.events.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(undone?.currentState.outs).toBe(2);
  });

  it("redoes the last undone event and restores its derived state", () => {
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([out("first", "away-1"), out("second", "away-2")]),
    });
    const undone = gameReducer(loaded, { type: "UNDO_LAST_EVENT" });
    const redone = gameReducer(undone, { type: "REDO_LAST_EVENT" });

    expect(undone?.events.map(({ id }) => id)).toEqual(["first"]);
    expect(undone?.currentState.outs).toBe(1);
    expect(redone?.events.map(({ id }) => id)).toEqual(["first", "second"]);
    expect(redone?.currentState.outs).toBe(2);
    expect(redone?.redoHistory).toEqual([]);
  });

  it("discards the redo event after recording a different event", () => {
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([out("first", "away-1")]),
    });
    const undone = gameReducer(loaded, { type: "UNDO_LAST_EVENT" });
    const changed = gameReducer(undone, {
      type: "ADD_EVENT",
      event: homeRun("replacement", "away-1"),
    });
    const redoAttempt = gameReducer(changed, { type: "REDO_LAST_EVENT" });

    expect(changed?.events.map(({ id }) => id)).toEqual(["replacement"]);
    expect(changed?.redoHistory).toEqual([]);
    expect(redoAttempt).toBe(changed);
  });

  it("keeps manual game end separate from replay and resumes explicitly", () => {
    const ended = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([out("first", "away-1")], "finished"),
    });
    const undone = gameReducer(ended, { type: "UNDO_LAST_EVENT" });
    const resumed = gameReducer(undone, { type: "RESUME_GAME" });

    expect(ended).toMatchObject({ status: "finished", manualEnded: true });
    expect(ended?.currentState.gameStatus).toBe("live");
    expect(undone).toMatchObject({
      status: "finished",
      manualEnded: true,
      events: [],
    });
    expect(resumed).toMatchObject({ status: "live", manualEnded: false });
  });

  it("removes a recorded manual end event when play is resumed", () => {
    const endEvent: GameEvent = {
      id: "end",
      kind: "gameControl",
      action: "endGame",
      reason: "時間切れ",
    };
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([out("first", "away-1"), endEvent], "finished"),
    });
    const resumed = gameReducer(loaded, { type: "RESUME_GAME" });

    expect(resumed).toMatchObject({
      status: "live",
      manualEnded: false,
      currentState: { gameStatus: "live" },
    });
    expect(resumed?.events.map((event) => event.id)).toEqual(["first"]);
  });

  it("restores a persisted manual end and can reset to setup", () => {
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([], "finished"),
    });

    expect(loaded).toMatchObject({
      status: "finished",
      manualEnded: true,
    });
    expect(gameReducer(loaded, { type: "RESET_GAME" })).toBeNull();
  });

  it("derives an automatic game end without marking it manual", () => {
    const game = persistedGame([
      homeRun("away-score", "away-1"),
      out("away-out-1", "away-2"),
      out("away-out-2", "away-1"),
      out("away-out-3", "away-2"),
      out("home-out-1", "home-1"),
      out("home-out-2", "home-2"),
      out("home-out-3", "home-1"),
    ]);
    game.config.regulationInnings = 1;

    const state = gameReducer(null, { type: "LOAD_GAME", game });
    const undone = gameReducer(state, { type: "UNDO_LAST_EVENT" });

    expect(state).toMatchObject({
      status: "finished",
      manualEnded: false,
      currentState: {
        gameStatus: "finished",
        gameEndReason: "completedHalf",
      },
    });
    expect(undone).toMatchObject({
      status: "live",
      manualEnded: false,
    });
  });

  it("uses replay violations rather than trusting invalid event input", () => {
    const collisionEvents: GameEvent[] = [
      {
        id: "first",
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
      },
      {
        id: "collision",
        kind: "atBat",
        batterId: "away-2",
        result: "single",
        movements: [
          {
            playerId: "away-2",
            from: "batter",
            to: "first",
            isRBI: false,
          },
        ],
      },
    ];

    const state = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame(collisionEvents),
    });

    expect(state?.events).toEqual(collisionEvents);
    expect(state?.currentState.runners.first).toBe("away-1");
    expect(state?.violations).toContainEqual(
      expect.objectContaining({
        eventId: "collision",
        code: "DESTINATION_OCCUPIED",
      })
    );
  });

  it("rejects a newly added invalid event instead of silently storing it", () => {
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([
        {
          id: "first",
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
        },
      ]),
    });
    const rejected = gameReducer(loaded, {
      type: "ADD_EVENT",
      event: {
        id: "collision",
        kind: "atBat",
        batterId: "away-2",
        result: "single",
        movements: [
          {
            playerId: "away-2",
            from: "batter",
            to: "first",
            isRBI: false,
          },
        ],
      },
    });

    expect(rejected).toBe(loaded);
    expect(rejected?.events.map((event) => event.id)).toEqual(["first"]);
  });

  it("rejects an invalid event edit and keeps the previous replay state", () => {
    const loaded = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([out("first", "away-1")]),
    });
    const rejected = gameReducer(loaded, {
      type: "UPDATE_EVENT",
      eventId: "first",
      event: {
        id: "ignored",
        kind: "atBat",
        batterId: "missing-player",
        result: "single",
        movements: [],
      },
    });

    expect(rejected).toBe(loaded);
    expect(rejected?.events[0]).toEqual(out("first", "away-1"));
    expect(rejected?.currentState.outs).toBe(1);
  });

  it("reports downstream events invalidated by an edit", () => {
    const single: GameEvent = {
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
    const doublePlay: GameEvent = {
      id: "double-play",
      kind: "atBat",
      batterId: "away-2",
      result: "otherOut",
      movements: [
        {
          playerId: "away-1",
          from: "first",
          to: "out",
          isRBI: false,
          outType: "force",
        },
        {
          playerId: "away-2",
          from: "batter",
          to: "out",
          isRBI: false,
        },
      ],
    };
    const state = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([single, doublePlay]),
    })!;

    const result = evaluateEventUpdate(
      state,
      "single",
      out("replacement", "away-1")
    );

    expect(result?.accepted).toBe(true);
    expect(result?.invalidatedEventIds).toEqual(["double-play"]);
  });

  it("reports downstream events invalidated by a deletion", () => {
    const single: GameEvent = {
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
    const doublePlay: GameEvent = {
      id: "double-play",
      kind: "atBat",
      batterId: "away-2",
      result: "otherOut",
      movements: [
        {
          playerId: "away-1",
          from: "first",
          to: "out",
          isRBI: false,
          outType: "force",
        },
        {
          playerId: "away-2",
          from: "batter",
          to: "out",
          isRBI: false,
        },
      ],
    };
    const state = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([single, doublePlay]),
    })!;

    const result = evaluateEventDeletion(state, "single");

    expect(result?.accepted).toBe(true);
    expect(result?.invalidatedEventIds).toEqual(["double-play"]);
  });
});

describe("app-state selectors", () => {
  it("selects batters and timeline entries from derived state", () => {
    const state = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([out("first", "away-1")]),
    });

    expect(getCurrentBatter(state!)).toMatchObject({ id: "away-2" });
    expect(getNextBatter(state!)).toMatchObject({ id: "away-1" });
    expect(getTimelineEntry(state!, "first")).toMatchObject({
      inning: 1,
      half: "top",
    });
  });

  it("selects a substitute from the replay-derived active lineup", () => {
    const game = persistedGame([
      {
        id: "sub",
        kind: "substitution",
        team: "away",
        inPlayerId: "away-bench",
        outPlayerId: "away-1",
        role: "pinchHitter",
      },
    ]);
    game.config.teams.away.benchPlayers = [
      { id: "away-bench", name: "away bench", order: 3 },
    ];
    const state = gameReducer(null, { type: "LOAD_GAME", game });

    expect(getCurrentBatter(state!)).toMatchObject({ id: "away-bench" });
    expect(getNextBatter(state!)).toMatchObject({ id: "away-2" });
  });

  it("projects only persisted input fields", () => {
    const state = gameReducer(null, {
      type: "LOAD_GAME",
      game: persistedGame([out("first", "away-1")]),
    });

    expect(toPersistedGame(state!)).toEqual({
      ...persistedGame([out("first", "away-1")]),
      status: "live",
      deletedEvents: [],
      undoHistory: [
        {
          events: [],
          deletedEvents: [],
          status: "live",
        },
      ],
      redoHistory: [],
    });
    expect(toPersistedGame(state!)).not.toHaveProperty("timeline");
    expect(toPersistedGame(state!)).not.toHaveProperty("currentState");
    expect(toPersistedGame(state!)).not.toHaveProperty("violations");
    expect(toPersistedGame(state!)).not.toHaveProperty("manualEnded");
  });
});

describe("roster edits during a game", () => {
  it("adds a bench player who can then enter the game", () => {
    const game = reduce([
      { type: "LOAD_GAME", game: persistedGame([out("o1", "away-1")]) },
      {
        type: "ADD_BENCH_PLAYER",
        team: "away",
        player: { id: "away-late", name: "遅れて来た選手" },
      },
      {
        type: "ADD_EVENT",
        event: {
          id: "ph",
          kind: "substitution",
          team: "away",
          inPlayerId: "away-late",
          outPlayerId: "away-2",
          role: "pinchHitter",
        },
      },
    ]);

    expect(game?.config.teams.away.benchPlayers).toEqual([
      { id: "away-late", name: "遅れて来た選手", order: 3, position: null },
    ]);
    expect(game?.currentState.activeLineup.away).toEqual([
      "away-1",
      "away-late",
    ]);
    expect(game?.events).toHaveLength(2);
    expect(toPersistedGame(game!).config.teams.away.benchPlayers).toHaveLength(
      1
    );
  });

  it("ignores a blank name or an id that is already on a roster", () => {
    const loaded = reduce([{ type: "LOAD_GAME", game: persistedGame() }]);

    expect(
      gameReducer(loaded, {
        type: "ADD_BENCH_PLAYER",
        team: "away",
        player: { id: "new", name: "   " },
      })
    ).toBe(loaded);
    expect(
      gameReducer(loaded, {
        type: "ADD_BENCH_PLAYER",
        team: "away",
        player: { id: "home-1", name: "重複" },
      })
    ).toBe(loaded);
  });

  it("renames a player without touching the recorded plays", () => {
    const base = persistedGame([out("o1", "away-1")]);
    base.config.teams.away.startingPitcherId = "away-1";
    base.config.teams.away.startingPitcherName = "away 1";

    const game = reduce([
      { type: "LOAD_GAME", game: base },
      { type: "RENAME_PLAYER", playerId: "away-1", name: " 山田 " },
    ]);

    expect(game?.config.teams.away.players[0].name).toBe("山田");
    expect(game?.config.teams.away.startingPitcherName).toBe("山田");
    expect(game?.events).toEqual(base.events);
    expect(game?.undoHistory).toHaveLength(1);
  });
});

describe("getFieldingPositionHistory", () => {
  it("lists every position a player has fielded, in order", () => {
    const base = persistedGame();
    base.config.teams.home.players[0].position = "pitcher";
    base.config.teams.home.players[1].position = "short";
    base.config.teams.home.benchPlayers = [
      { id: "home-bench", name: "home bench", order: 3 },
    ];

    const game = reduce([
      { type: "LOAD_GAME", game: base },
      {
        type: "ADD_EVENT",
        event: {
          id: "swap",
          kind: "positionChange",
          team: "home",
          changes: [
            { playerId: "home-2", position: "pitcher" },
            { playerId: "home-1", position: "short" },
          ],
        },
      },
      {
        type: "ADD_EVENT",
        event: {
          id: "sub",
          kind: "substitution",
          team: "home",
          inPlayerId: "home-bench",
          outPlayerId: "home-1",
          role: "fielder",
          position: "left",
        },
      },
    ])!;

    expect(getFieldingPositionHistory(game, "home", "home-1")).toEqual([
      "pitcher",
      "short",
    ]);
    expect(getFieldingPositionHistory(game, "home", "home-2")).toEqual([
      "short",
      "pitcher",
    ]);
    expect(getFieldingPositionHistory(game, "home", "home-bench")).toEqual([
      "left",
    ]);
    expect(getFieldingPositionHistory(game, "away", "away-1")).toEqual([]);
  });
});
