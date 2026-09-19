import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { GameEvent } from "../domain/types";

import type {
  LegacyGame,
  LegacyGameEvent as LegacyEvent,
} from "./legacy-v1-types";
import completeLegacyFixture from "./__fixtures__/v1-complete.json";
import type { PersistedGameV2 } from "./local-storage";
import {
  DEFAULT_GAME_STORAGE_KEY,
  DEFAULT_GAME_HISTORY_STORAGE_KEY,
  SCHEMA_VERSION,
  createGameRepository,
  createGameStorage,
  createStorageEnvelope,
  migrateV1Game,
  parseStoredGame,
  serializeStoredGame,
} from "./local-storage";

function persistedGame(
  overrides: Partial<PersistedGameV2> = {}
): PersistedGameV2 {
  return {
    id: "game",
    date: "2025-03-21",
    status: "live",
    config: {
      regulationInnings: 7,
      teams: {
        away: { name: "Away", players: [] },
        home: { name: "Home", players: [] },
      },
    },
    events: [],
    ...overrides,
  };
}

function outEvent(id: string): GameEvent {
  return {
    id,
    kind: "atBat",
    batterId: "away-1",
    result: "groundOut",
    movements: [
      {
        playerId: "away-1",
        from: "batter",
        to: "out",
        isRBI: false,
      },
    ],
  };
}

function legacyEvent(
  overrides: Partial<LegacyEvent> & Pick<LegacyEvent, "id">
): LegacyEvent {
  const { id, ...eventOverrides } = overrides;
  return {
    id,
    type: "atBat",
    inning: 9,
    half: "bottom",
    team: "home",
    batterId: "home-1",
    result: "single",
    runnerMovements: [],
    outsInPlay: 0,
    runsScored: 99,
    timestamp: "2025-03-21T12:00:00.000Z",
    ...eventOverrides,
  };
}

function legacyGame(events: LegacyEvent[]): LegacyGame {
  return {
    id: "legacy-game",
    date: "2025-03-21T12:00:00.000Z",
    totalInnings: 7,
    status: "live",
    teams: {
      away: {
        name: "Away",
        players: [{ id: "away-1", name: "Away 1", order: 1 }],
        startingPitcherId: "away-1",
        startingPitcherName: "Away 1",
      },
      home: {
        name: "Home",
        players: [{ id: "home-1", name: "Home 1", order: 1 }],
        startingPitcherId: "home-1",
        startingPitcherName: "Home 1",
      },
    },
    events,
    currentState: {
      inning: 12,
      half: "top",
      outs: 2,
      runners: { first: "home-1", second: null, third: null },
      currentBatterIndex: { away: 0, home: 0 },
    },
  };
}

describe("v2 storage envelope", () => {
  it("round-trips bounded edit history and deleted events", () => {
    const deletedEvent = outEvent("deleted");
    const game = persistedGame({
      deletedEvents: [{ event: deletedEvent, index: 0 }],
      undoHistory: [
        {
          events: [deletedEvent],
          deletedEvents: [],
          status: "live",
        },
      ],
      redoHistory: [],
    });

    expect(parseStoredGame(serializeStoredGame(game))).toEqual(game);
  });
  it("serializes schemaVersion 2 around input-only game data", () => {
    const game: PersistedGameV2 = {
      id: "game",
      date: "2025-03-21",
      status: "live",
      config: {
        regulationInnings: 7,
        teams: {
          away: { name: "Away", players: [] },
          home: { name: "Home", players: [] },
        },
      },
      events: [],
    };

    expect(createStorageEnvelope(game)).toEqual({
      schemaVersion: SCHEMA_VERSION,
      game,
    });
    expect(parseStoredGame(serializeStoredGame(game))).toEqual(game);
  });

  it("round-trips an optional force-out marker while accepting legacy movements without it", () => {
    const game = persistedGame({
      events: [
        {
          id: "force-out",
          kind: "atBat",
          batterId: "batter",
          result: "fieldersChoice",
          movements: [
            {
              playerId: "runner",
              from: "first",
              to: "out",
              isRBI: false,
              outType: "force",
            },
            {
              playerId: "batter",
              from: "batter",
              to: "first",
              isRBI: false,
            },
          ],
        },
      ],
    });

    expect(parseStoredGame(serializeStoredGame(game))).toEqual(game);
  });

  it("round-trips game notes and rejects a non-string note body", () => {
    const game = persistedGame({
      events: [
        {
          id: "note",
          kind: "note",
          text: "雨天のため10分間中断",
        },
      ],
    });

    expect(parseStoredGame(serializeStoredGame(game))).toEqual(game);

    const envelope = createStorageEnvelope(game) as unknown as {
      game: { events: Array<Record<string, unknown>> };
    };
    envelope.game.events[0].text = 123;
    expect(() => parseStoredGame(JSON.stringify(envelope))).toThrow(
      "malformed schema version 2 game"
    );
  });
});

describe("v2 storage of scoring-completeness events", () => {
  const events: GameEvent[] = [
    {
      id: "placement",
      kind: "runnerPlacement",
      runners: { first: "a1", second: null, third: null },
    },
    {
      id: "swap",
      kind: "positionChange",
      team: "home",
      changes: [{ playerId: "h1", position: "pitcher" }],
    },
    {
      id: "sub",
      kind: "substitution",
      team: "home",
      inPlayerId: "h2",
      outPlayerId: "h1",
      role: "fielder",
      position: "left",
    },
    {
      id: "advance",
      kind: "baseRunning",
      type: "otherAdvance",
      movements: [{ playerId: "a1", from: "first", to: "third", isRBI: false }],
    },
    {
      id: "running-out",
      kind: "baseRunning",
      type: "otherOut",
      movements: [{ playerId: "a1", from: "third", to: "out", isRBI: false }],
    },
  ];

  it("round-trips every new event shape", () => {
    const game = persistedGame({ events });

    expect(parseStoredGame(serializeStoredGame(game))).toEqual(game);
  });

  it.each([
    ["a placement base that is not a player id", 0, { runners: { first: 1 } }],
    ["a position change without a change list", 1, { changes: "none" }],
    [
      "a position change to an unknown position",
      1,
      { changes: [{ playerId: "h1", position: "rover" }] },
    ],
    ["a substitution into an unknown position", 2, { position: "rover" }],
  ])("rejects %s", (_label, index, patch) => {
    const envelope = createStorageEnvelope(
      persistedGame({ events })
    ) as unknown as { game: { events: Array<Record<string, unknown>> } };
    Object.assign(envelope.game.events[index], patch);

    expect(() => parseStoredGame(JSON.stringify(envelope))).toThrow(
      "malformed schema version 2 game"
    );
  });
});

describe("game repository writes", () => {
  it("writes the active game before updating history", () => {
    const values = new Map<string, string>();
    const writes: string[] = [];
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => {
        writes.push(key);
        values.set(key, value);
      }),
      removeItem: (key: string) => values.delete(key),
    };
    createGameRepository(storage).save(persistedGame());
    expect(writes).toEqual([
      DEFAULT_GAME_STORAGE_KEY,
      DEFAULT_GAME_HISTORY_STORAGE_KEY,
    ]);
  });
});

describe("v1 migration", () => {
  it("drops frozen placement and totals, retaining only event input", () => {
    const migrated = migrateV1Game(
      legacyGame([
        legacyEvent({
          id: "single",
          inning: 9,
          half: "bottom",
          team: "home",
          outsInPlay: 2,
          runsScored: 99,
        }),
      ])
    );

    expect(migrated.config.regulationInnings).toBe(7);
    expect(migrated.config.teams.away).toEqual({
      name: "Away",
      players: [{ id: "away-1", name: "Away 1", order: 1 }],
      startingPitcherId: "away-1",
      startingPitcherName: "Away 1",
    });
    expect(migrated.events[0]).toEqual({
      id: "single",
      kind: "atBat",
      batterId: "home-1",
      result: "single",
      movements: [],
    });
    expect(migrated.events[0]).not.toHaveProperty("inning");
    expect(migrated.events[0]).not.toHaveProperty("half");
    expect(migrated.events[0]).not.toHaveProperty("team");
    expect(migrated.events[0]).not.toHaveProperty("runsScored");
    expect(migrated.events[0]).not.toHaveProperty("outsInPlay");
    expect(migrated).not.toHaveProperty("currentState");
  });

  it("preserves a legacy unspecialized strikeout", () => {
    const migrated = migrateV1Game(
      legacyGame([
        legacyEvent({
          id: "strikeout",
          result: "strikeout",
        }),
      ])
    );

    expect(migrated.events[0]).toMatchObject({
      kind: "atBat",
      result: "strikeout",
    });
  });

  it("preserves a double play result and every out movement", () => {
    const movements = [
      {
        playerId: "home-1",
        from: "batter" as const,
        to: "out" as const,
        isRBI: false,
      },
      {
        playerId: "home-2",
        from: "first" as const,
        to: "out" as const,
        isRBI: false,
      },
    ];
    const migrated = migrateV1Game(
      legacyGame([
        legacyEvent({
          id: "double-play",
          result: "doublePlay",
          resultDetail: "遊併",
          runnerMovements: movements,
          outsInPlay: 2,
        }),
      ])
    );

    expect(migrated.events[0]).toMatchObject({
      kind: "atBat",
      result: "doublePlay",
      note: "遊併",
      movements,
    });
  });

  it("corrects the legacy 内野安 misclassification and structures its direction", () => {
    const migrated = migrateV1Game(
      legacyGame([
        legacyEvent({
          id: "infield-hit",
          result: "otherOut",
          resultDetail: "遊安",
          runnerMovements: [
            {
              playerId: "home-1",
              from: "batter",
              to: "first",
              isRBI: false,
            },
          ],
        }),
      ])
    );

    expect(migrated.events[0]).toMatchObject({
      kind: "atBat",
      result: "single",
      battedBall: { position: "short", type: "ground" },
    });

    const dummyNotation = migrateV1Game(
      legacyGame([
        legacyEvent({
          id: "dummy-infield-hit",
          result: "otherOut",
          resultDetail: "内野安",
        }),
      ])
    );
    expect(dummyNotation.events[0]).toMatchObject({
      kind: "atBat",
      result: "single",
      note: "内野安",
    });
  });

  it("migrates base-running events without derived fields", () => {
    const migrated = migrateV1Game(
      legacyGame([
        legacyEvent({
          id: "steal",
          type: "baseRunning",
          batterId: undefined,
          result: undefined,
          baseRunningType: "steal",
          rbiCreditBatterId: "home-1",
          runnerMovements: [
            {
              playerId: "home-1",
              from: "first",
              to: "second",
              isRBI: false,
            },
          ],
        }),
      ])
    );

    expect(migrated.events[0]).toEqual({
      id: "steal",
      kind: "baseRunning",
      type: "steal",
      movements: [
        {
          playerId: "home-1",
          from: "first",
          to: "second",
          isRBI: false,
        },
      ],
      rbiCreditBatterId: "home-1",
    });
  });

  it("migrates a complete real-world-shaped v1 payload fixture", () => {
    const migrated = migrateV1Game(
      completeLegacyFixture as unknown as LegacyGame
    );

    expect(migrated).toMatchObject({
      id: "fixture-summer-final",
      status: "finished",
      config: {
        regulationInnings: 7,
        teams: {
          away: { name: "青空クラブ" },
          home: { name: "河川敷スターズ" },
        },
      },
    });
    expect(migrated.events).toEqual([
      expect.objectContaining({
        id: "fixture-hit",
        kind: "atBat",
        result: "single",
      }),
      expect.objectContaining({
        id: "fixture-steal",
        kind: "baseRunning",
        type: "steal",
      }),
      expect.objectContaining({
        id: "fixture-double-play",
        kind: "atBat",
        result: "doublePlay",
      }),
    ]);
    expect(migrated).not.toHaveProperty("currentState");
    expect(migrated.events[0]).not.toHaveProperty("timestamp");
  });
});

describe("localStorage adapter", () => {
  it("saves v2, loads v1 through migration, and clears corrupt data", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    const adapter = createGameStorage(storage);
    const migrated = migrateV1Game(legacyGame([]));

    adapter.save(migrated);
    expect(
      JSON.parse(values.get(DEFAULT_GAME_STORAGE_KEY) ?? "{}")
    ).toHaveProperty("schemaVersion", 2);
    expect(adapter.load()).toEqual(migrated);

    values.set(DEFAULT_GAME_STORAGE_KEY, JSON.stringify(legacyGame([])));
    expect(adapter.load()).toEqual(migrated);

    values.set(DEFAULT_GAME_STORAGE_KEY, "{broken");
    expect(adapter.load()).toBeNull();
    expect(values.has(DEFAULT_GAME_STORAGE_KEY)).toBe(false);
  });

  it("rejects unsupported schema versions", () => {
    expect(() =>
      parseStoredGame(JSON.stringify({ schemaVersion: 3, game: {} }))
    ).toThrow("unsupported schema version: 3");
  });

  it("rejects a malformed v2 payload before replay can consume it", () => {
    expect(() =>
      parseStoredGame(
        JSON.stringify({
          schemaVersion: 2,
          game: {
            id: "broken",
            date: "2026-01-01",
            status: "live",
            config: { regulationInnings: 7 },
            events: [],
          },
        })
      )
    ).toThrow("malformed schema version 2 game");
  });

  it.each([
    ["unknown at-bat result", { result: "magicHit" }],
    ["malformed runner movement", { movements: [{ from: "moon" }] }],
    [
      "malformed batted ball",
      { battedBall: { position: "dugout", type: "ground" } },
    ],
    [
      "malformed fly depth",
      {
        battedBall: {
          position: "center",
          type: "fly",
          depth: "medium",
        },
      },
    ],
    ["malformed play order", { movements: [{ playOrder: 0 }] }],
    ["malformed fielding sequence", { fieldingSequence: ["dugout"] }],
  ])("rejects %s in a v2 event", (_label, eventPatch) => {
    const game = persistedGame({
      config: {
        regulationInnings: 7,
        teams: {
          away: {
            name: "Away",
            players: [{ id: "away-1", name: "Away 1", order: 1 }],
          },
          home: {
            name: "Home",
            players: [{ id: "home-1", name: "Home 1", order: 1 }],
          },
        },
      },
      events: [
        {
          id: "event",
          kind: "atBat",
          batterId: "away-1",
          result: "single",
          movements: [],
          ...eventPatch,
        } as PersistedGameV2["events"][number],
      ],
    });

    expect(() => parseStoredGame(serializeStoredGame(game))).toThrow(
      "malformed schema version 2 game"
    );
  });

  it("rejects malformed config and base-running event fields", () => {
    const raw = JSON.parse(serializeStoredGame(persistedGame()));
    raw.game.config.regulationInnings = 0;
    raw.game.config.teams.away.players = [
      { id: "away-1", name: "Away 1", order: 1, position: "bench" },
    ];
    raw.game.events = [
      {
        id: "run",
        kind: "baseRunning",
        type: "teleport",
        movements: [],
        rbiCreditBatterId: 99,
      },
    ];

    expect(() => parseStoredGame(JSON.stringify(raw))).toThrow(
      "malformed schema version 2 game"
    );
  });
});

describe("multiple game repository", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
      values,
      storage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    };
  }

  it("upserts games without duplicating ids and lists newest games first", () => {
    const { values, storage } = memoryStorage();
    const repository = createGameRepository(storage);

    repository.save(persistedGame({ id: "older", date: "2025-03-20" }));
    repository.save(persistedGame({ id: "newer", date: "2025-03-22" }));
    repository.save(
      persistedGame({ id: "older", date: "2025-03-23", status: "finished" })
    );

    expect(repository.list().map((game) => game.id)).toEqual([
      "older",
      "newer",
    ]);
    expect(repository.find("older")?.status).toBe("finished");
    expect(
      JSON.parse(values.get(DEFAULT_GAME_HISTORY_STORAGE_KEY) ?? "{}")
    ).toMatchObject({ schemaVersion: 2 });
    expect(
      JSON.parse(values.get(DEFAULT_GAME_STORAGE_KEY) ?? "{}").game.id
    ).toBe("older");
  });

  it("includes the legacy active-game key when no history has been saved", () => {
    const active = persistedGame({ id: "active" });
    const { storage } = memoryStorage({
      [DEFAULT_GAME_STORAGE_KEY]: serializeStoredGame(active),
    });

    expect(createGameRepository(storage).list()).toEqual([active]);
  });

  it("merges a missing active game into existing history", () => {
    const active = persistedGame({ id: "active", date: "2025-03-22" });
    const archived = persistedGame({ id: "archived", date: "2025-03-20" });
    const seeded = memoryStorage();
    const firstRepository = createGameRepository(seeded.storage);
    firstRepository.save(archived);
    seeded.values.set(DEFAULT_GAME_STORAGE_KEY, serializeStoredGame(active));

    expect(firstRepository.list().map((game) => game.id)).toEqual([
      "active",
      "archived",
    ]);
  });

  it("imports archived games without replacing the active game", () => {
    const { storage } = memoryStorage();
    const repository = createGameRepository(storage);
    const active = persistedGame({ id: "active", status: "live" });
    repository.save(active);

    repository.importGames([
      persistedGame({ id: "archived", status: "finished" }),
    ]);

    expect(repository.loadActive()?.id).toBe("active");
    expect(repository.list().map((game) => game.id)).toContain("archived");
  });

  it("deletes a game and clears the active key only when it points to that game", () => {
    const { values, storage } = memoryStorage();
    const repository = createGameRepository(storage);
    repository.save(persistedGame({ id: "one" }));
    repository.save(persistedGame({ id: "two" }));

    repository.remove("one");
    expect(repository.list().map((game) => game.id)).toEqual(["two"]);
    expect(values.has(DEFAULT_GAME_STORAGE_KEY)).toBe(true);

    repository.remove("two");
    expect(repository.list()).toEqual([]);
    expect(values.has(DEFAULT_GAME_STORAGE_KEY)).toBe(false);
  });

  it("isolates corrupt history and still recovers the compatible active game", () => {
    const active = persistedGame({ id: "active" });
    const { values, storage } = memoryStorage({
      [DEFAULT_GAME_STORAGE_KEY]: serializeStoredGame(active),
      [DEFAULT_GAME_HISTORY_STORAGE_KEY]: "{broken",
    });

    expect(createGameRepository(storage).list()).toEqual([active]);
    expect(values.has(DEFAULT_GAME_HISTORY_STORAGE_KEY)).toBe(false);
  });

  it("round-trips Phase 3 substitutions, bench players, and manual game end", () => {
    const game = persistedGame({
      config: {
        regulationInnings: 7,
        teams: {
          away: {
            name: "Away",
            players: [{ id: "starter", name: "Starter", order: 1 }],
            benchPlayers: [{ id: "pinch", name: "Pinch", order: 10 }],
          },
          home: {
            name: "Home",
            players: [{ id: "home-1", name: "Home 1", order: 1 }],
          },
        },
      },
      events: [
        {
          id: "substitution",
          kind: "substitution",
          team: "away",
          inPlayerId: "pinch",
          outPlayerId: "starter",
          role: "pinchHitter",
        },
        {
          id: "manual-end",
          kind: "gameControl",
          action: "endGame",
          reason: "降雨コールド",
        },
      ],
    });
    const { storage } = memoryStorage();
    const repository = createGameRepository(storage);

    repository.save(game);

    expect(repository.find(game.id)).toEqual(game);
  });

  it("retains all games until the capacity manager explicitly archives them", () => {
    const { values, storage } = memoryStorage();
    const repository = createGameRepository(storage);

    for (let day = 1; day <= 12; day++) {
      repository.save(
        persistedGame({
          id: `game-${day}`,
          date: `2026-07-${String(day).padStart(2, "0")}`,
        })
      );
    }

    expect(repository.list().map((game) => game.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `game-${12 - index}`)
    );
    const storedHistory = JSON.parse(
      values.get(DEFAULT_GAME_HISTORY_STORAGE_KEY) ?? "{}"
    );
    expect(storedHistory.games).toHaveLength(12);
  });
});
