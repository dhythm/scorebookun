import { createDatabase } from "../lib/db/client";
import { resolveDatabaseConfig } from "../lib/db/config";
import { loadEnvFiles } from "./env-files";
import { seedGames } from "../lib/server/seed";

async function main() {
  loadEnvFiles();

  const config = resolveDatabaseConfig(process.env);
  // Seeds overwrite games by id. They are for local and agent databases only.
  if (config.driver === "neon") {
    throw new Error("Refusing to seed a neon database");
  }

  const database = await createDatabase(config);
  try {
    const seeds = await seedGames(database.db);
    console.log(`Seeded ${seeds.length} games (${config.driver}):`);
    for (const { game, summary } of seeds) {
      console.log(`  /games/${game.id}\n    ${summary}`);
    }
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  // First line only: driver errors can carry connection details and values.
  console.error(
    "Seeding failed:",
    error instanceof Error ? error.message.split("\n")[0] : "unknown error"
  );
  process.exitCode = 1;
});
