import { spawnSync } from "node:child_process";

import { findEnvFiles } from "./env-files";

// `docker compose` reads only `.env` on its own. Pass the same files the app
// uses; with several --env-file flags the last one wins, hence the reverse.
const envFileArgs = findEnvFiles()
  .reverse()
  .flatMap((file) => ["--env-file", file]);

const result = spawnSync(
  "docker",
  ["compose", ...envFileArgs, ...process.argv.slice(2)],
  { stdio: "inherit" }
);
if (result.error) {
  console.error("Could not run docker compose:", result.error.message);
}
process.exitCode = result.status ?? 1;
