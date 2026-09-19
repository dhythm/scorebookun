import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "./client";
import { gameEvents, games, gameTeams } from "./schema";

const game = {
  status: "live" as const,
  startedAt: new Date("2026-09-19T00:00:00.000Z"),
  regulationInnings: 9,
};

const emptyNote = {
  gameId: "game-1",
  state: "active" as const,
  kind: "note" as const,
};

describe("createDatabase with in-memory PGlite", () => {
  let database: Database;

  beforeEach(async () => {
    database = await createDatabase({ driver: "pglite", dataDir: undefined });
    await database.migrate();
  });

  afterEach(async () => {
    await database.close();
  });

  it("applies migrations and round-trips a game row", async () => {
    await database.db.insert(games).values({ id: "game-1", ...game });

    const [stored] = await database.db
      .select()
      .from(games)
      .where(eq(games.id, "game-1"));

    expect(stored).toMatchObject({ ...game, version: 1, lastMutationId: null });
    expect(stored.createdAt).toBeInstanceOf(Date);
  });

  it("can run migrations repeatedly", async () => {
    await expect(database.migrate()).resolves.toBeUndefined();
  });

  it("rolls back a failed transaction", async () => {
    await expect(
      database.db.transaction(async (transaction) => {
        await transaction.insert(games).values({ id: "game-2", ...game });
        await transaction.insert(games).values({ id: "game-2", ...game });
      })
    ).rejects.toThrow();

    await expect(database.db.select().from(games)).resolves.toEqual([]);
  });

  it("deletes everything recorded in a game with the game", async () => {
    await database.db.insert(games).values({ id: "game-1", ...game });
    await database.db
      .insert(gameTeams)
      .values({ gameId: "game-1", side: "away", name: "Away" });
    await database.db
      .insert(gameEvents)
      .values({ ...emptyNote, id: "note", sequence: 0, noteText: "rain" });

    await database.db.delete(games).where(eq(games.id, "game-1"));

    await expect(database.db.select().from(gameTeams)).resolves.toEqual([]);
    await expect(database.db.select().from(gameEvents)).resolves.toEqual([]);
  });

  it.each([
    ["an out-of-range inning count", { regulationInnings: 0 }],
    ["an unknown status", { status: "paused" as never }],
  ])("rejects a game with %s", async (_label, patch) => {
    await expect(
      database.db.insert(games).values({ id: "game-1", ...game, ...patch })
    ).rejects.toThrow();
  });

  it.each([
    ["a note without text", { id: "e1", sequence: 0 }],
    [
      "an at-bat without a result",
      { id: "e1", sequence: 0, kind: "atBat" as const, batterId: "p1" },
    ],
    [
      "an active event with a restore position",
      { id: "e1", sequence: 0, noteText: "x", restoreIndex: 1 },
    ],
    [
      "a deleted event without a restore position",
      { id: "e1", sequence: 0, noteText: "x", state: "deleted" as const },
    ],
    [
      "a batted ball depth without a batted ball",
      {
        id: "e1",
        sequence: 0,
        noteText: "x",
        battedBallDepth: "deep" as const,
      },
    ],
  ])("rejects %s", async (_label, patch) => {
    await database.db.insert(games).values({ id: "game-1", ...game });

    await expect(
      database.db.insert(gameEvents).values({ ...emptyNote, ...patch })
    ).rejects.toThrow();
  });

  it("rejects two active events at the same position", async () => {
    await database.db.insert(games).values({ id: "game-1", ...game });
    const note = { ...emptyNote, sequence: 0, noteText: "x" };
    await database.db.insert(gameEvents).values({ ...note, id: "e1" });

    await expect(
      database.db.insert(gameEvents).values({ ...note, id: "e2" })
    ).rejects.toThrow();
  });
});
