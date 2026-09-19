import {
  parseStoredGame,
  type PersistedGameV2,
} from "../storage/local-storage";
import { parseHistoryArchive } from "./history-archive";

/**
 * Reads either kind of file the app exports: the game history, or a single
 * game from its result screen. Every game is validated before it is returned.
 */
export function parseImportedGames(serialized: string): PersistedGameV2[] {
  try {
    return parseHistoryArchive(serialized);
  } catch {
    // Not a history export; it may be a single game.
  }
  try {
    return [parseStoredGame(serialized)];
  } catch {
    throw new Error("unsupported import file");
  }
}
