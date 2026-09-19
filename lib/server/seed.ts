import type { Database } from "@/lib/db/client";
import { createSeedGames, type SeedGame } from "@/lib/seed/seed-games";

import { insertGame } from "./game-store";

/**
 * Puts every seed game back to its original state. Games people created
 * themselves are left untouched, so it is safe to run again at any time.
 */
export async function seedGames(db: Database["db"]): Promise<SeedGame[]> {
  const seeds = createSeedGames();
  for (const { game } of seeds) {
    await insertGame(db, game);
  }
  return seeds;
}
