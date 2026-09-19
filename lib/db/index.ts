import { createDatabase, type Database } from "./client";
import { resolveDatabaseConfig } from "./config";

// Cached on globalThis so dev-server hot reloads reuse one connection pool
// (and, with in-memory PGlite, one database).
const globalCache = globalThis as typeof globalThis & {
  scorebookunDatabase?: Promise<Database>;
};

async function openDatabase(): Promise<Database> {
  const config = resolveDatabaseConfig(process.env);
  const database = await createDatabase(config);
  if (config.driver === "pglite") {
    // PGlite lives inside this process, so nothing else can migrate it.
    await database.migrate();
    // An in-memory database starts empty on every launch (agent sandboxes,
    // E2E runs), so it gets the seed games instead of a separate seed step.
    if (config.dataDir === undefined) {
      const { seedGames } = await import("@/lib/server/seed");
      await seedGames(database.db);
    }
  }
  return database;
}

export function getDatabase(): Promise<Database> {
  if (!globalCache.scorebookunDatabase) {
    const opening = openDatabase();
    globalCache.scorebookunDatabase = opening;
    // A failed connection must not be cached forever.
    opening.catch(() => {
      if (globalCache.scorebookunDatabase === opening) {
        globalCache.scorebookunDatabase = undefined;
      }
    });
  }
  return globalCache.scorebookunDatabase;
}
