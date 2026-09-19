import type { StorageLike } from "./local-storage";

const SYNC_META_STORAGE_KEY = "scorebookun-sync-meta";

/** What this device knows about its copy of a shared game. */
type GameSyncMeta = {
  /** Server version the device copy is based on. */
  baseVersion: number;
  /** The device copy has changes the server has not accepted yet. */
  dirty: boolean;
};

type SyncMetaStore = {
  get(gameId: string): GameSyncMeta | null;
  set(gameId: string, meta: GameSyncMeta): void;
  remove(gameId: string): void;
};

function isGameSyncMeta(value: unknown): value is GameSyncMeta {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.baseVersion === "number" &&
    Number.isSafeInteger(meta.baseVersion) &&
    typeof meta.dirty === "boolean"
  );
}

export function createSyncMetaStore(
  storage: StorageLike,
  key = SYNC_META_STORAGE_KEY
): SyncMetaStore {
  function readAll(): Record<string, GameSyncMeta> {
    try {
      const parsed: unknown = JSON.parse(storage.getItem(key) ?? "{}");
      if (typeof parsed !== "object" || parsed === null) return {};
      return Object.fromEntries(
        Object.entries(parsed).filter(([, meta]) => isGameSyncMeta(meta))
      );
    } catch {
      return {};
    }
  }

  return {
    get: (gameId) => readAll()[gameId] ?? null,
    set(gameId, meta) {
      storage.setItem(key, JSON.stringify({ ...readAll(), [gameId]: meta }));
    },
    remove(gameId) {
      const { [gameId]: removed, ...rest } = readAll();
      void removed;
      storage.setItem(key, JSON.stringify(rest));
    },
  };
}

export function createBrowserSyncMetaStore(): SyncMetaStore {
  if (typeof window === "undefined") {
    throw new Error("localStorage is unavailable outside the browser");
  }
  return createSyncMetaStore(window.localStorage);
}
