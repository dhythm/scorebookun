import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/*.spec.ts belongs to Playwright.
    include: ["**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
});
