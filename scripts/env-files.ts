import { existsSync } from "node:fs";

/**
 * Env files that exist, highest priority first. `.env.local` wins over
 * `.env`, matching how Next.js loads them for the app itself.
 */
export function findEnvFiles(
  exists: (file: string) => boolean = existsSync
): string[] {
  return [".env.local", ".env"].filter((file) => exists(file));
}

/** Variables already set in the shell win over both files. */
export function loadEnvFiles(): void {
  // loadEnvFile never overrides a variable that is already set, so loading
  // in priority order gives the first file the last word.
  for (const file of findEnvFiles()) process.loadEnvFile(file);
}
