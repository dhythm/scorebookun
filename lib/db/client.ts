import path from "node:path";

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { DatabaseConfig } from "./config";
import * as schema from "./schema";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export type Database = {
  db: PgDatabase<PgQueryResultHKT, typeof schema>;
  migrate: () => Promise<void>;
  close: () => Promise<void>;
};

// Drivers are imported lazily so that a deployment only loads the one it uses.
export async function createDatabase(
  config: DatabaseConfig
): Promise<Database> {
  switch (config.driver) {
    case "postgres": {
      const { Pool } = await import("pg");
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      const pool = new Pool({ connectionString: config.url });
      const db = drizzle(pool, { schema });
      return {
        db,
        migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
        close: () => pool.end(),
      };
    }
    case "neon": {
      const { Pool } = await import("@neondatabase/serverless");
      const { drizzle } = await import("drizzle-orm/neon-serverless");
      const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
      const pool = new Pool({ connectionString: config.url });
      const db = drizzle(pool, { schema });
      return {
        db,
        migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
        close: () => pool.end(),
      };
    }
    case "pglite": {
      const { PGlite } = await import("@electric-sql/pglite");
      const { drizzle } = await import("drizzle-orm/pglite");
      const { migrate } = await import("drizzle-orm/pglite/migrator");
      const client = new PGlite(config.dataDir);
      const db = drizzle(client, { schema });
      return {
        db,
        migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
        close: () => client.close(),
      };
    }
  }
}
