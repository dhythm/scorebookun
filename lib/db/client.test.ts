import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "./client";
import type { SharedGame } from "@/lib/sync/shared-game";

import { games } from "./schema";

function gamePayload(id: string): SharedGame {
  return {
    id,
    date: "2026-09-19T00:00:00.000Z",
    status: "live",
    config: {
      regulationInnings: 9,
      teams: {
        away: { name: "Away", players: [] },
        home: { name: "Home", players: [] },
      },
    },
    events: [],
  };
}

describe("createDatabase with in-memory PGlite", () => {
  let database: Database;

  beforeEach(async () => {
    database = await createDatabase({ driver: "pglite", dataDir: undefined });
    await database.migrate();
  });

  afterEach(async () => {
    await database.close();
  });

  it("applies migrations and round-trips a game payload", async () => {
    const payload = gamePayload("game-1");

    await database.db.insert(games).values({ id: "game-1", payload });
    const [stored] = await database.db
      .select()
      .from(games)
      .where(eq(games.id, "game-1"));

    expect(stored.payload).toEqual(payload);
    expect(stored.createdAt).toBeInstanceOf(Date);
    expect(stored.updatedAt).toBeInstanceOf(Date);
  });

  it("can run migrations repeatedly", async () => {
    await expect(database.migrate()).resolves.toBeUndefined();
  });

  it("rolls back a failed transaction", async () => {
    await expect(
      database.db.transaction(async (transaction) => {
        await transaction
          .insert(games)
          .values({ id: "game-2", payload: gamePayload("game-2") });
        await transaction
          .insert(games)
          .values({ id: "game-2", payload: gamePayload("game-2") });
      })
    ).rejects.toThrow();

    await expect(database.db.select().from(games)).resolves.toEqual([]);
  });
});
