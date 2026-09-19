import { existsSync } from "node:fs";

import { createDatabase } from "../lib/db/client";
import { resolveDatabaseConfig } from "../lib/db/config";

async function main() {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  const config = resolveDatabaseConfig(process.env);
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
