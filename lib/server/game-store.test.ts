import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "@/lib/db/client";
import type { GameConfig } from "@/lib/domain/types";

import { createGame, findGame, saveGame } from "./game-store";

const config: GameConfig = {
  regulationInnings: 9,
  teams: {
    away: { name: "Away", players: [] },
    home: { name: "Home", players: [] },
  },
};
const date = "2026-09-19T00:00:00.000Z";

describe("game store", () => {
  let database: Database;

  beforeEach(async () => {
    database = await createDatabase({ driver: "pglite", dataDir: undefined });
    await database.migrate();
  });

  afterEach(async () => {
    await database.close();
  });

  it("creates a live game at version 1 with an unguessable id", async () => {
    const created = await createGame(database.db, { date, config });
    const other = await createGame(database.db, { date, config });

    expect(created.version).toBe(1);
    expect(created.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(other.id).not.toBe(created.id);
    expect(created.game).toEqual({
      id: created.id,
      date,
      status: "live",
      config,
      events: [],
    });
  });

  it("finds a created game and returns null for an unknown id", async () => {
    const created = await createGame(database.db, { date, config });

    await expect(findGame(database.db, created.id)).resolves.toEqual({
      game: created.game,
      version: 1,
    });
    await expect(findGame(database.db, "missing")).resolves.toBeNull();
  });

  it("saves on top of the current version and increments it", async () => {
    const created = await createGame(database.db, { date, config });
    const game = { ...created.game, status: "finished" as const };

    const result = await saveGame(database.db, {
      id: created.id,
      baseVersion: 1,
      mutationId: "mutation-1",
      game,
    });

    expect(result).toEqual({ status: "saved", version: 2 });
    await expect(findGame(database.db, created.id)).resolves.toEqual({
      game,
      version: 2,
    });
  });

  it("rejects a save based on a stale version without overwriting", async () => {
    const created = await createGame(database.db, { date, config });
    const first = { ...created.game, status: "finished" as const };
    await saveGame(database.db, {
      id: created.id,
      baseVersion: 1,
      mutationId: "mutation-1",
      game: first,
    });

    const result = await saveGame(database.db, {
      id: created.id,
      baseVersion: 1,
      mutationId: "mutation-2",
      game: created.game,
    });

    expect(result).toEqual({ status: "conflict", game: first, version: 2 });
    await expect(findGame(database.db, created.id)).resolves.toEqual({
      game: first,
      version: 2,
    });
  });

  it("treats a retry of the already applied mutation as saved", async () => {
    const created = await createGame(database.db, { date, config });
    const request = {
      id: created.id,
      baseVersion: 1,
      mutationId: "mutation-1",
      game: created.game,
    };
    await saveGame(database.db, request);

    await expect(saveGame(database.db, request)).resolves.toEqual({
      status: "saved",
      version: 2,
    });
  });

  it("reports an unknown game", async () => {
    await expect(
      saveGame(database.db, {
        id: "missing",
        baseVersion: 1,
        mutationId: "mutation-1",
        game: {
          id: "missing",
          date,
          status: "live",
          config,
          events: [],
        },
      })
    ).resolves.toEqual({ status: "notFound" });
  });
});
