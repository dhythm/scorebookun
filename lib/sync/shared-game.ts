import {
  createStorageEnvelope,
  parseStoredGame,
  type PersistedGameV2,
} from "@/lib/storage/local-storage";

/**
 * The part of a game that every participant shares. Undo and redo stacks are
 * whole-board snapshots, so sharing them would let one scorer roll back
 * another scorer's plays; they stay on the device.
 */
export type SharedGame = Omit<PersistedGameV2, "undoHistory" | "redoHistory">;

export function toSharedGame(game: PersistedGameV2): SharedGame {
  const { undoHistory, redoHistory, ...sharedGame } = game;
  void undoHistory;
  void redoHistory;
  return sharedGame;
}

/** Validates untrusted input with the same guards as device storage. */
export function parseSharedGame(value: unknown): SharedGame {
  return toSharedGame(
    parseStoredGame(
      JSON.stringify(createStorageEnvelope(value as PersistedGameV2))
    )
  );
}
