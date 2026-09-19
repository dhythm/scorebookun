// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameEvent } from "./domain/types";
import { GameProvider, useGame } from "./game-context";
import {
  createBrowserGameRepository,
  type PersistedGameV2,
} from "./storage/local-storage";
import { createBrowserSyncMetaStore } from "./storage/sync-meta";
import type { GameApi } from "./sync/game-api";
import type { SharedGame } from "./sync/shared-game";

const game: PersistedGameV2 = {
  id: "same-game",
  date: "2026-07-27T00:00:00.000Z",
  status: "live",
  config: {
    regulationInnings: 7,
    teams: {
      away: {
        name: "Away",
        players: [{ id: "away-1", name: "Away 1", order: 1 }],
      },
      home: {
        name: "Home",
        players: [{ id: "home-1", name: "Home 1", order: 1 }],
      },
    },
  },
  events: [],
};

const recordedOut: GameEvent = {
  id: "out",
  kind: "atBat",
  batterId: "away-1",
  result: "groundOut",
  movements: [
    {
      playerId: "away-1",
      from: "batter",
      to: "out",
      isRBI: false,
    },
  ],
};

/** An in-memory stand-in for the server with real optimistic locking. */
function fakeServer(
  initial: SharedGame | null = game,
  initialDeleteKey: string | null = null
) {
  const state = {
    current: initial ? { game: initial, version: 1 } : null,
    deleteKey: initialDeleteKey,
    online: true,
  };
  const api: GameApi = {
    create: vi.fn<GameApi["create"]>(async ({ date, config, deleteKey }) => {
      if (!state.online) return { status: "unavailable" };
      state.deleteKey = deleteKey ?? null;
      const created: SharedGame = {
        id: "created-game",
        date,
        status: "live",
        config,
        events: [],
      };
      state.current = { game: created, version: 1 };
      return { status: "created", id: created.id, game: created, version: 1 };
    }),
    fetch: vi.fn<GameApi["fetch"]>(async (gameId, sinceVersion) => {
      if (!state.online) return { status: "unavailable" };
      if (!state.current || state.current.game.id !== gameId) {
        return { status: "notFound" };
      }
      if (state.current.version === sinceVersion) {
        return { status: "unchanged" };
      }
      return { status: "found", ...state.current };
    }),
    save: vi.fn<GameApi["save"]>(async (input) => {
      if (!state.online) return { status: "unavailable" };
      if (!state.current) return { status: "notFound" };
      if (state.current.version !== input.baseVersion) {
        return { status: "conflict", ...state.current };
      }
      state.current = { game: input.game, version: input.baseVersion + 1 };
      return { status: "saved", version: state.current.version };
    }),
    delete: vi.fn<GameApi["delete"]>(async (gameId, deleteKey) => {
      if (!state.online) return { status: "unavailable" };
      if (!state.current || state.current.game.id !== gameId) {
        return { status: "notFound" };
      }
      if (state.deleteKey === null) return { status: "noKey" };
      if (state.deleteKey !== deleteKey) return { status: "wrongKey" };
      state.current = null;
      return { status: "deleted" };
    }),
  };
  return {
    api,
    state,
    /** Another scorer saves first. */
    saveFromElsewhere(events: GameEvent[]) {
      if (!state.current) throw new Error("No game on the fake server");
      state.current = {
        game: { ...state.current.game, events },
        version: state.current.version + 1,
      };
    },
  };
}

function Harness() {
  const {
    game: currentGame,
    dispatch,
    addEvent,
    createGame,
    deleteGame,
    loadGame,
    storageConflict,
    storageError,
  } = useGame();

  return (
    <div>
      <span data-testid="game-id">{currentGame?.id ?? "none"}</span>
      <span data-testid="event-count">{currentGame?.events.length ?? -1}</span>
      <span data-testid="conflict">{String(storageConflict)}</span>
      <span data-testid="storage-error">{String(storageError)}</span>
      <button
        type="button"
        onClick={() => dispatch({ type: "ADD_EVENT", event: recordedOut })}
      >
        dispatch add
      </button>
      <button type="button" onClick={() => addEvent(recordedOut)}>
        command add
      </button>
      <button
        type="button"
        onClick={() =>
          void createGame({ date: game.date, config: game.config })
        }
      >
        test create
      </button>
      <button
        type="button"
        onClick={() =>
          void createGame(
            { date: game.date, config: game.config },
            "open sesame"
          )
        }
      >
        test create with key
      </button>
      {["open sesame", "open barley"].map((deleteKey) => (
        <button
          key={deleteKey}
          type="button"
          onClick={() =>
            void deleteGame(game.id, deleteKey).then((result) => {
              document.body.dataset.deleteResult = result.status;
            })
          }
        >
          {`test delete with ${deleteKey}`}
        </button>
      ))}
      <button
        type="button"
        onClick={() =>
          void loadGame(game.id).then((result) => {
            document.body.dataset.loadResult = result;
          })
        }
      >
        test load
      </button>
    </div>
  );
}

function renderProvider(api: GameApi) {
  return render(
    <GameProvider api={api} pollIntervalMs={20} retryDelayMs={20}>
      <Harness />
    </GameProvider>
  );
}

const eventCount = () => screen.getByTestId("event-count").textContent;

describe("GameProvider shared game sync", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.body.dataset.loadResult;
    delete document.body.dataset.deleteResult;
  });

  afterEach(() => {
    cleanup();
  });

  it("creates the game on the server before showing it", async () => {
    const user = userEvent.setup();
    const server = fakeServer(null);
    renderProvider(server.api);

    await user.click(screen.getByText("test create"));

    await waitFor(() =>
      expect(screen.getByTestId("game-id").textContent).toBe("created-game")
    );
    expect(server.api.save).not.toHaveBeenCalled();
    expect(createBrowserSyncMetaStore().get("created-game")).toEqual({
      baseVersion: 1,
      dirty: false,
    });
  });

  it("loads a game this device has never seen from the server", async () => {
    const user = userEvent.setup();
    const server = fakeServer({ ...game, events: [recordedOut] });
    renderProvider(server.api);

    await user.click(screen.getByText("test load"));

    await waitFor(() => expect(eventCount()).toBe("1"));
    expect(document.body.dataset.loadResult).toBe("loaded");
    expect(createBrowserGameRepository().find(game.id)?.events).toHaveLength(1);
  });

  it("reports a game that does not exist on the server", async () => {
    const user = userEvent.setup();
    renderProvider(fakeServer(null).api);

    await user.click(screen.getByText("test load"));

    await waitFor(() =>
      expect(document.body.dataset.loadResult).toBe("notFound")
    );
    expect(eventCount()).toBe("-1");
  });

  it("saves a local change on top of the loaded version", async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderProvider(server.api);
    await user.click(screen.getByText("test load"));
    await waitFor(() => expect(eventCount()).toBe("0"));

    await user.click(screen.getByText("command add"));

    await waitFor(() => expect(server.state.current?.version).toBe(2));
    expect(server.state.current?.game.events).toEqual([recordedOut]);
    expect(server.state.current?.game).not.toHaveProperty("undoHistory");
    await waitFor(() =>
      expect(createBrowserSyncMetaStore().get(game.id)).toEqual({
        baseVersion: 2,
        dirty: false,
      })
    );
  });

  it("shows another scorer's update automatically while idle", async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderProvider(server.api);
    await user.click(screen.getByText("test load"));
    await waitFor(() => expect(eventCount()).toBe("0"));

    server.saveFromElsewhere([recordedOut]);

    await waitFor(() => expect(eventCount()).toBe("1"));
    expect(screen.getByTestId("conflict").textContent).toBe("false");
    expect(server.api.save).not.toHaveBeenCalled();
  });

  it("warns instead of overwriting when someone else saved first", async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderProvider(server.api);
    await user.click(screen.getByText("test load"));
    await waitFor(() => expect(eventCount()).toBe("0"));
    const note: GameEvent = { id: "note", kind: "note", text: "rain delay" };
    server.api.fetch = vi.fn(async () => ({ status: "unchanged" as const }));

    server.saveFromElsewhere([note]);
    await user.click(screen.getByText("command add"));

    await waitFor(() =>
      expect(screen.getByText("他の人がこの試合を更新しました")).toBeTruthy()
    );
    expect(screen.getByTestId("editing-blocker")).toBeTruthy();
    expect(server.state.current?.game.events).toEqual([note]);

    await user.click(screen.getByText("dispatch add"));
    expect(eventCount()).toBe("1");

    await user.click(screen.getByText("最新の内容を読み込む"));
    await waitFor(() =>
      expect(screen.getByTestId("conflict").textContent).toBe("false")
    );
    expect(eventCount()).toBe("1");

    await user.click(screen.getByText("command add"));
    await waitFor(() =>
      expect(server.state.current?.game.events).toEqual([note, recordedOut])
    );
  });

  it("keeps recording while offline and sends the change when back", async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderProvider(server.api);
    await user.click(screen.getByText("test load"));
    await waitFor(() => expect(eventCount()).toBe("0"));

    server.state.online = false;
    await user.click(screen.getByText("command add"));

    await waitFor(() =>
      expect(screen.getByText("未送信の変更があります")).toBeTruthy()
    );
    expect(eventCount()).toBe("1");
    expect(createBrowserSyncMetaStore().get(game.id)).toEqual({
      baseVersion: 1,
      dirty: true,
    });

    server.state.online = true;
    await waitFor(() =>
      expect(screen.getByTestId("storage-error").textContent).toBe("false")
    );
    expect(server.state.current?.game.events).toEqual([recordedOut]);
  });

  it("sends changes a previous session could not send", async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    createBrowserGameRepository().save({ ...game, events: [recordedOut] });
    createBrowserSyncMetaStore().set(game.id, { baseVersion: 1, dirty: true });
    renderProvider(server.api);

    await user.click(screen.getByText("test load"));

    await waitFor(() =>
      expect(server.state.current?.game.events).toEqual([recordedOut])
    );
    expect(eventCount()).toBe("1");
  });
  describe("deleting a game", () => {
    it("creates a game with a delete key", async () => {
      const user = userEvent.setup();
      const server = fakeServer(null);
      renderProvider(server.api);

      await user.click(screen.getByText("test create with key"));

      await waitFor(() =>
        expect(screen.getByTestId("game-id").textContent).toBe("created-game")
      );
      expect(server.state.deleteKey).toBe("open sesame");
    });

    it("removes the game from the server and from this device", async () => {
      const user = userEvent.setup();
      const server = fakeServer(game, "open sesame");
      renderProvider(server.api);
      await user.click(screen.getByText("test load"));
      await waitFor(() => expect(eventCount()).toBe("0"));

      await user.click(screen.getByText("test delete with open sesame"));

      await waitFor(() =>
        expect(document.body.dataset.deleteResult).toBe("deleted")
      );
      expect(server.state.current).toBeNull();
      expect(screen.getByTestId("game-id").textContent).toBe("none");
      expect(createBrowserGameRepository().find(game.id)).toBeNull();
      expect(createBrowserSyncMetaStore().get(game.id)).toBeNull();
    });

    it("keeps everything when the key is wrong", async () => {
      const user = userEvent.setup();
      const server = fakeServer(game, "open sesame");
      renderProvider(server.api);
      await user.click(screen.getByText("test load"));
      await waitFor(() => expect(eventCount()).toBe("0"));

      await user.click(screen.getByText("test delete with open barley"));

      await waitFor(() =>
        expect(document.body.dataset.deleteResult).toBe("wrongKey")
      );
      expect(server.state.current).not.toBeNull();
      expect(screen.getByTestId("game-id").textContent).toBe(game.id);
      expect(createBrowserGameRepository().find(game.id)).not.toBeNull();
    });

    it("tells a scorer when someone else deleted the game", async () => {
      const user = userEvent.setup();
      const server = fakeServer(game, "open sesame");
      renderProvider(server.api);
      await user.click(screen.getByText("test load"));
      await waitFor(() => expect(eventCount()).toBe("0"));

      server.state.current = null;

      expect(await screen.findByText("この試合は削除されました")).toBeTruthy();
    });
  });
});
