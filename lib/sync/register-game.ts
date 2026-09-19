import type { GameApi, VersionedGame } from "./game-api";
import type { SharedGame } from "./shared-game";

/**
 * Registers a game on the server. The server always issues the id, so a game
 * that already has plays (an imported archive, a development scenario) is
 * created empty and then saved once under its new id.
 */
export async function registerGame(
  api: Pick<GameApi, "create" | "save">,
  game: SharedGame,
  createMutationId: () => string
): Promise<VersionedGame | null> {
  const created = await api.create({ date: game.date, config: game.config });
  if (created.status !== "created") return null;

  const registered: SharedGame = { ...game, id: created.id };
  const hasRecordedPlays =
    game.events.length > 0 ||
    game.status !== "live" ||
    (game.deletedEvents?.length ?? 0) > 0;
  if (!hasRecordedPlays) return { game: registered, version: created.version };

  const saved = await api.save({
    id: created.id,
    baseVersion: created.version,
    mutationId: createMutationId(),
    game: registered,
  });
  if (saved.status !== "saved") return null;
  return { game: registered, version: saved.version };
}
