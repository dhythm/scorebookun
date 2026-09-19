import { createDatabase } from "../lib/db/client";
import { resolveMigrationConfig } from "../lib/db/config";
import { loadEnvFiles } from "./env-files";

async function main() {
  loadEnvFiles();

  const config = resolveMigrationConfig(process.env);
  const database = await createDatabase(config);
  try {
    await database.migrate();
    console.log(`Migrations applied (${config.driver})`);
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  // Log only the message: driver errors can carry the connection string.
  console.error(
    "Migration failed:",
    error instanceof Error ? error.message : "unknown error"
  );
  process.exitCode = 1;
});
