import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // CI runs the production build; locally the dev server is reused.
    command: isCI
      ? `pnpm build && pnpm start --port ${PORT}`
      : `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    // In-memory PGlite: every run starts from an empty database, no Docker.
    env: { DATABASE_DRIVER: "pglite", PGLITE_DATA_DIR: "" },
    reuseExistingServer: !isCI,
    timeout: 180_000,
  },
});
