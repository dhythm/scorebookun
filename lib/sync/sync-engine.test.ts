import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchGameResult, GameApi, SaveGameResult } from "./game-api";
import type { SharedGame } from "./shared-game";
import { createGameSync, type GameSyncState } from "./sync-engine";

function gameWith(eventCount: number): SharedGame {
  return {
    id: "game-1",
    date: "2026-09-19T00:00:00.000Z",
    status: "live",
    config: {
      regulationInnings: 9,
      teams: {
        away: { name: "Away", players: [] },
        home: { name: "Home", players: [] },
      },
    },
    events: Array.from({ length: eventCount }, (_, index) => ({
      id: `note-${index}`,
      kind: "note" as const,
      text: `note ${index}`,
    })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function setup(options: { pendingGame?: SharedGame } = {}) {
  const save = vi.fn<GameApi["save"]>();
  const fetch = vi.fn<GameApi["fetch"]>();
  const states: GameSyncState[] = [];
  const remoteGames: Array<{ game: SharedGame; version: number }> = [];
  let mutationCount = 0;
  const sync = createGameSync({
    api: { save, fetch },
    gameId: "game-1",
    baseVersion: 1,
    pendingGame: options.pendingGame,
    pollIntervalMs: 3_000,
    retryDelayMs: 1_000,
    shouldPoll: () => true,
    createMutationId: () => `mutation-${++mutationCount}`,
    onStateChange: (state) => states.push(state),
    onRemoteGame: (game, version) => remoteGames.push({ game, version }),
  });
  return { sync, save, fetch, states, remoteGames };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

describe("createGameSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a local change on top of the base version", async () => {
    const { sync, save, states } = setup();
    save.mockResolvedValue({ status: "saved", version: 2 });

    sync.push(gameWith(1));
    await flush();

    expect(save).toHaveBeenCalledWith({
      id: "game-1",
      baseVersion: 1,
      mutationId: "mutation-1",
      game: gameWith(1),
    });
    expect(states.at(-1)).toEqual({ status: "synced", baseVersion: 2 });
    sync.stop();
  });

  it("sends one request at a time and coalesces to the latest change", async () => {
    const { sync, save } = setup();
    const first = deferred<SaveGameResult>();
    save.mockReturnValueOnce(first.promise);
    save.mockResolvedValue({ status: "saved", version: 3 });

    sync.push(gameWith(1));
    sync.push(gameWith(2));
    sync.push(gameWith(3));
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve({ status: "saved", version: 2 });
    await flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({
      id: "game-1",
      baseVersion: 2,
      mutationId: "mutation-2",
      game: gameWith(3),
    });
    sync.stop();
  });

  it("stops and reports the server game on a version conflict", async () => {
    const { sync, save, states } = setup();
    save.mockResolvedValue({
      status: "conflict",
      game: gameWith(5),
      version: 4,
    });

    sync.push(gameWith(1));
    await flush();
    sync.push(gameWith(2));
    await flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({
      status: "conflict",
      baseVersion: 1,
      remote: { game: gameWith(5), version: 4 },
    });
    sync.stop();
  });

  it("continues from the server version after the conflict is accepted", async () => {
    const { sync, save, states } = setup();
    save.mockResolvedValueOnce({
      status: "conflict",
      game: gameWith(5),
      version: 4,
    });
    save.mockResolvedValue({ status: "saved", version: 5 });
    sync.push(gameWith(1));
    await flush();

    expect(sync.acceptRemote()).toEqual({ game: gameWith(5), version: 4 });
    expect(states.at(-1)).toEqual({ status: "synced", baseVersion: 4 });

    sync.push(gameWith(6));
    await flush();
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ baseVersion: 4, game: gameWith(6) })
    );
    sync.stop();
  });

  it("retries an unsent save with the same mutation before newer changes", async () => {
    const { sync, save, states } = setup();
    save.mockResolvedValueOnce({ status: "unavailable" });
    save.mockResolvedValue({ status: "saved", version: 2 });

    sync.push(gameWith(1));
    await flush();
    expect(states.at(-1)).toEqual({ status: "unsent", baseVersion: 1 });

    sync.push(gameWith(2));
    await vi.advanceTimersByTimeAsync(1_000);

    expect(save).toHaveBeenNthCalledWith(2, {
      id: "game-1",
      baseVersion: 1,
      mutationId: "mutation-1",
      game: gameWith(1),
    });
    expect(save).toHaveBeenNthCalledWith(3, {
      id: "game-1",
      baseVersion: 2,
      mutationId: "mutation-2",
      game: gameWith(2),
    });
    sync.stop();
  });

  it("retries immediately when asked, for example when back online", async () => {
    const { sync, save, states } = setup();
    save.mockResolvedValueOnce({ status: "unavailable" });
    save.mockResolvedValue({ status: "saved", version: 2 });
    sync.push(gameWith(1));
    await flush();

    sync.retryNow();
    await flush();

    expect(states.at(-1)).toEqual({ status: "synced", baseVersion: 2 });
    sync.stop();
  });

  it("sends changes left unsent by a previous session", async () => {
    const { sync, save } = setup({ pendingGame: gameWith(1) });
    save.mockResolvedValue({ status: "saved", version: 2 });

    sync.start();
    await flush();

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ baseVersion: 1, game: gameWith(1) })
    );
    sync.stop();
  });

  it("applies a newer server game while there are no local changes", async () => {
    const { sync, fetch, remoteGames, states } = setup();
    fetch.mockResolvedValueOnce({ status: "unchanged" });
    fetch.mockResolvedValue({ status: "found", game: gameWith(2), version: 3 });

    sync.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(fetch).toHaveBeenLastCalledWith("game-1", 1);
    expect(remoteGames).toEqual([]);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(remoteGames).toEqual([{ game: gameWith(2), version: 3 }]);
    expect(states.at(-1)).toEqual({ status: "synced", baseVersion: 3 });
    sync.stop();
  });

  it("leaves the conflict decision to the retried save while changes are unsent", async () => {
    // A poll cannot tell another scorer's save from this device's own save
    // whose response was lost; only the save (with its mutation id) can.
    const { sync, save, fetch, remoteGames, states } = setup();
    save.mockResolvedValueOnce({ status: "unavailable" });
    save.mockResolvedValue({
      status: "conflict",
      game: gameWith(2),
      version: 3,
    });
    sync.start();
    sync.push(gameWith(1));
    await flush();

    await vi.advanceTimersByTimeAsync(3_000);

    expect(fetch).not.toHaveBeenCalled();
    expect(remoteGames).toEqual([]);
    expect(states.at(-1)).toEqual({
      status: "conflict",
      baseVersion: 1,
      remote: { game: gameWith(2), version: 3 },
    });
    sync.stop();
  });

  it("ignores a poll result that raced with its own save", async () => {
    const { sync, save, fetch, remoteGames, states } = setup();
    const polled = deferred<FetchGameResult>();
    const saved = deferred<SaveGameResult>();
    fetch.mockReturnValueOnce(polled.promise);
    save.mockReturnValueOnce(saved.promise);
    sync.start();
    await vi.advanceTimersByTimeAsync(3_000);

    sync.push(gameWith(1));
    polled.resolve({ status: "found", game: gameWith(1), version: 2 });
    await flush();
    saved.resolve({ status: "saved", version: 2 });
    await flush();

    expect(remoteGames).toEqual([]);
    expect(states.at(-1)).toEqual({ status: "synced", baseVersion: 2 });
    sync.stop();
  });

  it("does not apply a server game once a local change has been announced", async () => {
    const { sync, save, fetch, remoteGames } = setup();
    const polled = deferred<FetchGameResult>();
    fetch.mockReturnValueOnce(polled.promise);
    save.mockResolvedValue({ status: "saved", version: 2 });
    sync.start();
    await vi.advanceTimersByTimeAsync(3_000);

    sync.markDirty();
    polled.resolve({ status: "found", game: gameWith(4), version: 2 });
    await flush();

    expect(remoteGames).toEqual([]);
    sync.stop();
  });

  it("reports a game that no longer exists", async () => {
    const { sync, save, states } = setup();
    save.mockResolvedValue({ status: "notFound" });

    sync.push(gameWith(1));
    await flush();

    expect(states.at(-1)).toEqual({ status: "missing", baseVersion: 1 });
    sync.stop();
  });

  it("does nothing after it is stopped", async () => {
    const { sync, save, fetch } = setup();
    sync.start();
    sync.stop();

    sync.push(gameWith(1));
    await vi.advanceTimersByTimeAsync(10_000);

    expect(save).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("stops when a poll finds the game deleted", async () => {
    const { sync, fetch, save, states } = setup();
    fetch.mockResolvedValue({ status: "notFound" });
    sync.start();

    await vi.advanceTimersByTimeAsync(3_000);

    expect(states.at(-1)).toEqual({ status: "missing", baseVersion: 1 });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    sync.push(gameWith(1));
    await flush();
    expect(save).not.toHaveBeenCalled();
  });
});
