"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  EditingConflictAlert,
  GameDeletedAlert,
  StorageFailureAlert,
} from "@/components/reliability-alerts";
import type { AppGame, GameAction } from "./app-state/types";
import { gameReducer } from "./app-state/reducer";
import {
  evaluateEventAddition,
  evaluateEventUpdate,
} from "./app-state/reducer";
import { toPersistedGame } from "./app-state/selectors";
import { generateId } from "./game-utils";
import {
  createBrowserGameRepository,
  type PersistedGameV2,
} from "./storage/local-storage";
import { createBrowserSyncMetaStore } from "./storage/sync-meta";
import {
  createGameApi,
  type DeleteGameResult,
  type GameApi,
} from "./sync/game-api";
import { registerGame } from "./sync/register-game";
import { toSharedGame, type SharedGame } from "./sync/shared-game";
import {
  createGameSync,
  type GameSync,
  type GameSyncState,
} from "./sync/sync-engine";
import type { GameConfig, GameEvent, Violation } from "./domain/types";

/** A game before the server has issued its id; plays are optional. */
type NewGame = { date: string; config: GameConfig } & Partial<
  Pick<SharedGame, "status" | "events" | "deletedEvents">
>;

type LoadGameResult = "loaded" | "notFound" | "unavailable";

interface GameContextValue {
  game: AppGame | null;
  storageReady: boolean;
  /** Someone else saved first; editing is locked until their game is loaded. */
  storageConflict: boolean;
  /** Changes are not safely stored yet (unsent, or the device copy failed). */
  storageError: boolean;
  dispatch: (action: GameAction) => boolean;
  retrySave: () => void;
  /**
   * Registers a new shared game on the server; resolves to its id. Whoever
   * knows the optional delete key can delete the game later.
   */
  createGame: (newGame: NewGame, deleteKey?: string) => Promise<string | null>;
  /** Deletes the game for everyone, then drops this device's copy. */
  deleteGame: (gameId: string, deleteKey: string) => Promise<DeleteGameResult>;
  /** Registers archived games on the server; resolves to how many succeeded. */
  importGames: (games: readonly PersistedGameV2[]) => Promise<number>;
  loadGame: (gameId: string) => Promise<LoadGameResult>;
  resetGame: () => void;
  reloadConflictingGame: () => void;
  addEvent: (event: GameEvent) => {
    accepted: boolean;
    violations: Violation[];
    invalidatedEventIds: string[];
  };
  updateEvent: (
    eventId: string,
    event: GameEvent
  ) => {
    accepted: boolean;
    violations: Violation[];
    invalidatedEventIds: string[];
  };
}

const GameContext = createContext<GameContextValue | null>(null);

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_RETRY_DELAY_MS = 2_000;

function canPoll(): boolean {
  return document.visibilityState === "visible" && navigator.onLine;
}

interface GameProviderProps {
  children: ReactNode;
  api?: GameApi;
  pollIntervalMs?: number;
  retryDelayMs?: number;
}

export function GameProvider({
  children,
  api: providedApi,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: GameProviderProps) {
  const [game, reducerDispatch] = useReducer(gameReducer, null);
  const [storageReady, setStorageReady] = useState(false);
  const [syncState, setSyncState] = useState<GameSyncState | null>(null);
  const [deviceSaveFailed, setDeviceSaveFailed] = useState(false);
  // Bumped by every local action so the save effect runs even when the
  // reducer returns the same state.
  const [localChangeCount, setLocalChangeCount] = useState(0);
  const [api] = useState<GameApi>(() => providedApi ?? createGameApi());
  const syncRef = useRef<{ gameId: string; sync: GameSync } | null>(null);
  const localChangeRef = useRef(false);
  // Read synchronously by dispatch, before React re-renders with the state.
  const storageConflictRef = useRef(false);

  const storageConflict = syncState?.status === "conflict";
  const unsent = syncState?.status === "unsent";
  const storageError = unsent || deviceSaveFailed;
  const gameMissing = syncState?.status === "missing";

  useEffect(() => {
    setStorageReady(true);
    return () => syncRef.current?.sync.stop();
  }, []);

  const stopSync = useCallback(() => {
    syncRef.current?.sync.stop();
    syncRef.current = null;
    localChangeRef.current = false;
    storageConflictRef.current = false;
    setSyncState(null);
  }, []);

  const startSync = useCallback(
    (gameId: string, baseVersion: number, pendingGame?: SharedGame) => {
      stopSync();
      const sync = createGameSync({
        api,
        gameId,
        baseVersion,
        pendingGame,
        pollIntervalMs,
        retryDelayMs,
        shouldPoll: canPoll,
        createMutationId: generateId,
        onStateChange: (state) => {
          if (syncRef.current?.sync !== sync) return;
          storageConflictRef.current = state.status === "conflict";
          setSyncState(state);
        },
        onRemoteGame: (remoteGame) => {
          if (syncRef.current?.sync !== sync) return;
          reducerDispatch({ type: "LOAD_GAME", game: remoteGame });
        },
      });
      syncRef.current = { gameId, sync };
      setSyncState({
        status: pendingGame ? "saving" : "synced",
        baseVersion,
      });
      sync.start();
    },
    [api, pollIntervalMs, retryDelayMs, stopSync]
  );

  // The device copy is written on every change; the server is the source of
  // truth, and the copy is what survives a lost connection or a reload.
  useEffect(() => {
    if (!storageReady || !game) return;
    const active = syncRef.current?.gameId === game.id ? syncRef.current : null;
    const persistedGame = toPersistedGame(game);

    if (active && localChangeRef.current) {
      localChangeRef.current = false;
      active.sync.push(toSharedGame(persistedGame));
    }
    try {
      createBrowserGameRepository().save(persistedGame);
      setDeviceSaveFailed(false);
    } catch {
      setDeviceSaveFailed(true);
    }
  }, [game, localChangeCount, storageReady]);

  useEffect(() => {
    if (!syncState || !syncRef.current || syncState.status === "conflict") {
      return;
    }
    try {
      createBrowserSyncMetaStore().set(syncRef.current.gameId, {
        baseVersion: syncState.baseVersion,
        dirty: syncState.status !== "synced",
      });
    } catch {
      setDeviceSaveFailed(true);
    }
  }, [syncState]);

  useEffect(() => {
    const retry = () => syncRef.current?.sync.retryNow();
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, []);

  const dispatch = useCallback((action: GameAction): boolean => {
    const isLocalChange =
      action.type !== "LOAD_GAME" && action.type !== "RESET_GAME";
    if (storageConflictRef.current && isLocalChange) return false;
    if (isLocalChange) {
      localChangeRef.current = true;
      syncRef.current?.sync.markDirty();
      setLocalChangeCount((count) => count + 1);
    }
    reducerDispatch(action);
    return true;
  }, []);

  const retrySave = useCallback(() => {
    syncRef.current?.sync.retryNow();
    if (!game) return;
    try {
      createBrowserGameRepository().save(toPersistedGame(game));
      setDeviceSaveFailed(false);
    } catch {
      setDeviceSaveFailed(true);
    }
  }, [game]);

  const register = useCallback(
    (newGame: NewGame, deleteKey?: string) =>
      registerGame(
        api,
        { id: "", status: "live", events: [], ...newGame },
        generateId,
        deleteKey
      ),
    [api]
  );

  const createGame = useCallback<GameContextValue["createGame"]>(
    async (newGame, deleteKey) => {
      const registered = await register(newGame, deleteKey);
      if (!registered) return null;
      reducerDispatch({ type: "LOAD_GAME", game: registered.game });
      startSync(registered.game.id, registered.version);
      return registered.game.id;
    },
    [register, startSync]
  );

  const importGames = useCallback<GameContextValue["importGames"]>(
    async (games) => {
      let importedCount = 0;
      for (const archivedGame of games) {
        const registered = await register(toSharedGame(archivedGame));
        if (!registered) continue;
        createBrowserGameRepository().importGames([registered.game]);
        createBrowserSyncMetaStore().set(registered.game.id, {
          baseVersion: registered.version,
          dirty: false,
        });
        importedCount += 1;
      }
      return importedCount;
    },
    [register]
  );

  const loadGame = useCallback(
    async (gameId: string): Promise<LoadGameResult> => {
      const deviceGame = createBrowserGameRepository().find(gameId);
      const meta = createBrowserSyncMetaStore().get(gameId);
      if (deviceGame && meta) {
        reducerDispatch({ type: "LOAD_GAME", game: deviceGame });
        startSync(
          gameId,
          meta.baseVersion,
          meta.dirty ? toSharedGame(deviceGame) : undefined
        );
        return "loaded";
      }

      const fetched = await api.fetch(gameId);
      if (fetched.status !== "found") {
        return fetched.status === "notFound" ? "notFound" : "unavailable";
      }
      reducerDispatch({ type: "LOAD_GAME", game: fetched.game });
      startSync(gameId, fetched.version);
      return "loaded";
    },
    [api, startSync]
  );

  const resetGame = useCallback(() => {
    createBrowserGameRepository().clearActive();
    stopSync();
    reducerDispatch({ type: "RESET_GAME" });
  }, [stopSync]);

  const deleteGame = useCallback<GameContextValue["deleteGame"]>(
    async (gameId, deleteKey) => {
      const result = await api.delete(gameId, deleteKey);
      // Already gone from the server is as good as deleted for this device.
      if (result.status !== "deleted" && result.status !== "notFound") {
        return result;
      }
      try {
        createBrowserGameRepository().remove(gameId);
        createBrowserSyncMetaStore().remove(gameId);
      } catch {
        // The server copy is gone; a leftover device copy is harmless.
      }
      if (syncRef.current?.gameId === gameId) resetGame();
      return result;
    },
    [api, resetGame]
  );

  const reloadConflictingGame = useCallback(() => {
    const accepted = syncRef.current?.sync.acceptRemote();
    if (!accepted) return;
    reducerDispatch({ type: "LOAD_GAME", game: accepted.game });
  }, []);

  const addEvent = useCallback(
    (event: GameEvent) => {
      if (!game || storageConflictRef.current)
        return {
          accepted: false,
          violations: [],
          invalidatedEventIds: [],
        };
      const result = evaluateEventAddition(game, event);
      if (result.accepted) {
        dispatch({ type: "ADD_EVENT", event });
      }
      return {
        accepted: result.accepted,
        violations: result.violations,
        invalidatedEventIds: result.invalidatedEventIds,
      };
    },
    [dispatch, game, storageConflictRef]
  );

  const updateEvent = useCallback(
    (eventId: string, event: GameEvent) => {
      if (!game || storageConflictRef.current)
        return {
          accepted: false,
          violations: [],
          invalidatedEventIds: [],
        };
      const result = evaluateEventUpdate(game, eventId, event);
      if (!result)
        return {
          accepted: false,
          violations: [],
          invalidatedEventIds: [],
        };
      if (result.accepted) {
        dispatch({ type: "UPDATE_EVENT", eventId, event });
      }
      return {
        accepted: result.accepted,
        violations: result.violations,
        invalidatedEventIds: result.invalidatedEventIds,
      };
    },
    [dispatch, game, storageConflictRef]
  );

  return (
    <GameContext.Provider
      value={{
        game,
        storageReady,
        storageConflict,
        storageError,
        dispatch,
        retrySave,
        createGame,
        deleteGame,
        importGames,
        loadGame,
        resetGame,
        reloadConflictingGame,
        addEvent,
        updateEvent,
      }}
    >
      {children}
      {storageError && !storageConflict && (
        <StorageFailureAlert unsent={unsent} onRetry={retrySave} />
      )}
      {storageConflict && (
        <EditingConflictAlert onReload={reloadConflictingGame} />
      )}
      {gameMissing && <GameDeletedAlert />}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used within a GameProvider");
  }
  return context;
}
