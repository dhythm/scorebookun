import { describe, expect, it } from "vitest";

import type { SharedGame } from "@/lib/sync/shared-game";

import { fromGameRows, toGameRows } from "./game-rows";

const fullGame: SharedGame = {
  id: "game-1",
  date: "2026-09-19T01:02:03.456Z",
  status: "finished",
  config: {
    regulationInnings: 7,
    teams: {
      away: {
        name: "Away",
        players: [
          { id: "a1", name: "A One", order: 1, position: "pitcher" },
          { id: "a2", name: "A Two", order: 2 },
        ],
        benchPlayers: [{ id: "a10", name: "A Ten", order: 10 }],
        startingPitcherId: "a1",
        startingPitcherName: "A One",
      },
      home: {
        name: "Home",
        players: [{ id: "h1", name: "H One", order: 1, position: "dh" }],
      },
    },
  },
  events: [
    {
      id: "e1",
      kind: "atBat",
      batterId: "a1",
      result: "doublePlay",
      battedBall: { position: "short", type: "ground" },
      fieldingSequence: ["short", "second", "first"],
      note: "great play",
      movements: [
        {
          playerId: "a1",
          from: "batter",
          to: "out",
          isRBI: false,
          playOrder: 2,
          outType: "force",
        },
      ],
    },
    {
      id: "e2",
      kind: "atBat",
      batterId: "a2",
      result: "flyOut",
      battedBall: { position: "center", type: "fly", depth: "deep" },
      movements: [],
    },
    {
      id: "e3",
      kind: "baseRunning",
      type: "wildPitch",
      rbiCreditBatterId: "a2",
      movements: [{ playerId: "a1", from: "third", to: "home", isRBI: true }],
    },
    {
      id: "e4",
      kind: "substitution",
      team: "home",
      inPlayerId: "h9",
      outPlayerId: "h1",
      role: "pinchHitter",
    },
    { id: "e5", kind: "note", text: "rain delay" },
    { id: "e6", kind: "gameControl", action: "endGame", reason: "rain" },
  ],
  deletedEvents: [
    { index: 2, event: { id: "d1", kind: "note", text: "mistake" } },
  ],
};

describe("game rows", () => {
  it("round-trips every kind of event and every optional field", () => {
    expect(fromGameRows(toGameRows(fullGame))).toEqual(fullGame);
  });

  it("round-trips a game with nothing optional", () => {
    const minimal: SharedGame = {
      id: "game-2",
      date: "2026-09-19T00:00:00.000Z",
      status: "live",
      config: {
        regulationInnings: 9,
        teams: {
          away: { name: "Away", players: [] },
          home: { name: "Home", players: [] },
        },
      },
      events: [{ id: "e1", kind: "gameControl", action: "endGame" }],
    };

    expect(fromGameRows(toGameRows(minimal))).toEqual(minimal);
  });

  it("keeps list order in sequence columns, not in array position", () => {
    const rows = toGameRows(fullGame);
    const shuffled = {
      ...rows,
      players: [...rows.players].reverse(),
      events: [...rows.events].reverse(),
      movements: [...rows.movements].reverse(),
    };

    expect(fromGameRows(shuffled)).toEqual(fullGame);
  });

  it("stores the trash in the same table with its restore position", () => {
    const { events } = toGameRows(fullGame);

    expect(events.find((event) => event.id === "d1")).toMatchObject({
      state: "deleted",
      sequence: 0,
      restoreIndex: 2,
    });
    expect(events.find((event) => event.id === "e1")).toMatchObject({
      state: "active",
      sequence: 0,
      restoreIndex: null,
    });
  });

  it("rejects a date that is not a valid timestamp", () => {
    expect(() => toGameRows({ ...fullGame, date: "yesterday" })).toThrow(
      "Invalid game date"
    );
  });
});
