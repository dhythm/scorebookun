import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "@/lib/db/client";
import { games } from "@/lib/db/schema";
import { createSeedGames } from "@/lib/seed/seed-games";

import { createGame, findGame, saveGame } from "./game-store";
import { seedGames } from "./seed";

describe("seedGames", () => {
  let database: Database;

  beforeEach(async () => {
    database = await createDatabase({ driver: "pglite", dataDir: undefined });
    await database.migrate();
  });

  afterEach(async () => {
    await database.close();
  });

  it("stores every seed game at version 1", async () => {
    const seeded = await seedGames(database.db);

    expect(seeded).toHaveLength(createSeedGames().length);
    for (const { game } of createSeedGames()) {
      await expect(findGame(database.db, game.id)).resolves.toEqual({
        game,
        version: 1,
      });
    }
  });

  it("restores edited seed games and leaves other games alone", async () => {
    await seedGames(database.db);
    const [{ game }] = createSeedGames();
    await saveGame(database.db, {
      id: game.id,
      baseVersion: 1,
      mutationId: "mutation-1",
      game: { ...game, status: "finished" },
    });
    const own = await createGame(database.db, {
      date: game.date,
      config: game.config,
    });

    await seedGames(database.db);

    await expect(findGame(database.db, game.id)).resolves.toEqual({
      game,
      version: 1,
    });
    await expect(findGame(database.db, own.id)).resolves.not.toBeNull();
    await expect(database.db.select().from(games)).resolves.toHaveLength(
      createSeedGames().length + 1
    );
  });
});
