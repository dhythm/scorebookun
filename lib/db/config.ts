const DATABASE_DRIVERS = ["postgres", "neon", "pglite"] as const;

type DatabaseDriver = (typeof DATABASE_DRIVERS)[number];

export type DatabaseConfig =
  | { driver: "postgres" | "neon"; url: string }
  | { driver: "pglite"; dataDir: string | undefined };

// Reads DATABASE_DRIVER, DATABASE_URL, and PGLITE_DATA_DIR.
type DatabaseEnv = Record<string, string | undefined>;

function isDatabaseDriver(value: string): value is DatabaseDriver {
  return (DATABASE_DRIVERS as readonly string[]).includes(value);
}

export function resolveDatabaseConfig(env: DatabaseEnv): DatabaseConfig {
  const driver = env.DATABASE_DRIVER ?? "postgres";
  if (!isDatabaseDriver(driver)) {
    throw new Error(
      `DATABASE_DRIVER must be one of ${DATABASE_DRIVERS.join(", ")} (received "${driver}")`
    );
  }

  if (driver === "pglite") {
    return { driver, dataDir: env.PGLITE_DATA_DIR || undefined };
  }

  if (!env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is required for the ${driver} driver`);
  }
  return { driver, url: env.DATABASE_URL };
}
