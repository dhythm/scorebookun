import type { GameApi, VersionedGame } from "./game-api";
import type { SharedGame } from "./shared-game";

export type GameSyncState =
  /** Everything on this device is on the server. */
  | { status: "synced"; baseVersion: number }
  | { status: "saving"; baseVersion: number }
  /** The last save did not reach the server; it is retried automatically. */
  | { status: "unsent"; baseVersion: number }
  /** Someone else saved first. Local changes are never sent over theirs. */
  | { status: "conflict"; baseVersion: number; remote: VersionedGame }
  | { status: "missing"; baseVersion: number };

export type GameSync = {
  start(): void;
  stop(): void;
  /**
   * Announces a local change synchronously, before the changed game exists,
   * so a server game arriving in between is not applied over it.
   */
  markDirty(): void;
  push(game: SharedGame): void;
  retryNow(): void;
  /** Adopts the server game after a conflict and resumes syncing. */
  acceptRemote(): VersionedGame | null;
};

type GameSyncOptions = {
  api: Pick<GameApi, "fetch" | "save">;
  gameId: string;
  baseVersion: number;
  /** Changes a previous session could not send. */
  pendingGame?: SharedGame;
  pollIntervalMs: number;
  retryDelayMs: number;
  shouldPoll: () => boolean;
  createMutationId: () => string;
  onStateChange: (state: GameSyncState) => void;
  onRemoteGame: (game: SharedGame, version: number) => void;
};

const MAX_RETRY_DELAY_MS = 30_000;

export function createGameSync(options: GameSyncOptions): GameSync {
  const { api, gameId } = options;
  let baseVersion = options.baseVersion;
  let pendingGame: SharedGame | null = options.pendingGame ?? null;
  // Kept until the server answers, so a retry repeats the exact same request
  // and a save whose response was lost is not mistaken for a conflict.
  let mutation: { id: string; game: SharedGame } | null = null;
  let localChangeAnnounced = false;
  let saving = false;
  let halted: "conflict" | "missing" | null = null;
  let remote: VersionedGame | null = null;
  let stopped = false;
  let failureCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const isDirty = () =>
    localChangeAnnounced || pendingGame !== null || mutation !== null;

  function emit(status: "synced" | "saving" | "unsent" | "missing") {
    options.onStateChange({ status, baseVersion });
  }

  function reportConflict(conflict: VersionedGame) {
    halted = "conflict";
    remote = conflict;
    clearRetry();
    options.onStateChange({
      status: "conflict",
      baseVersion,
      remote: conflict,
    });
  }

  function clearRetry() {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  async function flush(): Promise<void> {
    if (stopped || halted || saving) return;
    if (!mutation) {
      if (!pendingGame) return;
      mutation = { id: options.createMutationId(), game: pendingGame };
    }
    const current = mutation;
    saving = true;
    clearRetry();
    emit("saving");

    const result = await api.save({
      id: gameId,
      baseVersion,
      mutationId: current.id,
      game: current.game,
    });
    saving = false;
    if (stopped) return;

    switch (result.status) {
      case "saved":
        baseVersion = result.version;
        failureCount = 0;
        mutation = null;
        if (pendingGame === current.game) pendingGame = null;
        if (pendingGame) return flush();
        emit("synced");
        return;
      case "conflict":
        reportConflict({ game: result.game, version: result.version });
        return;
      case "notFound":
        halted = "missing";
        emit("missing");
        return;
      case "unavailable":
      case "rejected": {
        const delay = Math.min(
          options.retryDelayMs * 2 ** failureCount,
          MAX_RETRY_DELAY_MS
        );
        failureCount += 1;
        retryTimer = setTimeout(() => void flush(), delay);
        emit("unsent");
        return;
      }
    }
  }

  async function poll(): Promise<void> {
    // With local changes, only a save can tell another scorer's update from
    // this device's own save whose response was lost, so saves decide.
    if (stopped || halted || saving || isDirty() || !options.shouldPoll()) {
      return;
    }
    const result = await api.fetch(gameId, baseVersion);
    if (stopped || halted || saving || isDirty()) return;
    if (result.status === "notFound") {
      halted = "missing";
      emit("missing");
      return;
    }
    if (result.status !== "found" || result.version <= baseVersion) return;

    baseVersion = result.version;
    options.onRemoteGame(result.game, result.version);
    emit("synced");
  }

  return {
    start() {
      if (stopped || pollTimer !== null) return;
      pollTimer = setInterval(() => void poll(), options.pollIntervalMs);
      void flush();
    },
    stop() {
      stopped = true;
      clearRetry();
      if (pollTimer !== null) clearInterval(pollTimer);
      pollTimer = null;
    },
    markDirty() {
      localChangeAnnounced = true;
    },
    push(game) {
      if (stopped || halted) return;
      localChangeAnnounced = false;
      pendingGame = game;
      void flush();
    },
    retryNow() {
      failureCount = 0;
      void flush();
      void poll();
    },
    acceptRemote() {
      if (halted !== "conflict" || !remote) return null;
      const accepted = remote;
      halted = null;
      remote = null;
      localChangeAnnounced = false;
      pendingGame = null;
      mutation = null;
      failureCount = 0;
      baseVersion = accepted.version;
      emit("synced");
      return accepted;
    },
  };
}
