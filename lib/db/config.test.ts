import { describe, expect, it } from "vitest";

import { resolveDatabaseConfig, resolveMigrationConfig } from "./config";

describe("resolveDatabaseConfig", () => {
  it("uses the postgres driver with DATABASE_URL by default", () => {
    expect(
      resolveDatabaseConfig({ DATABASE_URL: "postgres://localhost/app" })
    ).toEqual({ driver: "postgres", url: "postgres://localhost/app" });
  });

  it("uses the neon driver with DATABASE_URL", () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_DRIVER: "neon",
        DATABASE_URL: "postgres://example.neon.tech/app",
      })
    ).toEqual({ driver: "neon", url: "postgres://example.neon.tech/app" });
  });

  it("uses a persistent PGlite directory when one is given", () => {
    expect(
      resolveDatabaseConfig({
        DATABASE_DRIVER: "pglite",
        PGLITE_DATA_DIR: ".pglite",
      })
    ).toEqual({ driver: "pglite", dataDir: ".pglite" });
  });

  it("uses in-memory PGlite when no directory is given", () => {
    expect(resolveDatabaseConfig({ DATABASE_DRIVER: "pglite" })).toEqual({
      driver: "pglite",
      dataDir: undefined,
    });
  });

  it("rejects an unknown driver", () => {
    expect(() => resolveDatabaseConfig({ DATABASE_DRIVER: "mysql" })).toThrow(
      'DATABASE_DRIVER must be one of postgres, neon, pglite (received "mysql")'
    );
  });

  it.each(["postgres", "neon"])(
    "requires DATABASE_URL for the %s driver",
    (driver) => {
      expect(() => resolveDatabaseConfig({ DATABASE_DRIVER: driver })).toThrow(
        `DATABASE_URL is required for the ${driver} driver`
      );
    }
  );
});

describe("resolveMigrationConfig", () => {
  it("prefers the direct connection over the pooled one", () => {
    expect(
      resolveMigrationConfig({
        DATABASE_DRIVER: "neon",
        DATABASE_URL: "postgres://example-pooler.neon.tech/app",
        DATABASE_URL_UNPOOLED: "postgres://example.neon.tech/app",
      })
    ).toEqual({ driver: "neon", url: "postgres://example.neon.tech/app" });
  });

  it("falls back to DATABASE_URL", () => {
    expect(
      resolveMigrationConfig({ DATABASE_URL: "postgres://localhost/app" })
    ).toEqual({ driver: "postgres", url: "postgres://localhost/app" });
  });

  it("ignores an empty DATABASE_URL_UNPOOLED", () => {
    expect(
      resolveMigrationConfig({
        DATABASE_URL: "postgres://localhost/app",
        DATABASE_URL_UNPOOLED: "",
      })
    ).toEqual({ driver: "postgres", url: "postgres://localhost/app" });
  });
});
