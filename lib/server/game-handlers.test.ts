import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase, type Database } from "@/lib/db/client";
import type { GameConfig } from "@/lib/domain/types";

import { games } from "@/lib/db/schema";

import {
  handleCreateGame,
  handleDeleteGame,
  handleGetGame,
  handleSaveGame,
} from "./game-handlers";

const config: GameConfig = {
  regulationInnings: 9,
  teams: {
    away: { name: "Away", players: [] },
    home: { name: "Home", players: [] },
  },
};
const date = "2026-09-19T00:00:00.000Z";

function jsonRequest(method: string, body: unknown, url = "http://test/api") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("game handlers", () => {
  let database: Database;

  beforeEach(async () => {
    database = await createDatabase({ driver: "pglite", dataDir: undefined });
    await database.migrate();
  });

  afterEach(async () => {
    await database.close();
  });

  async function create(extra: Record<string, unknown> = {}) {
    const response = await handleCreateGame(
      database.db,
      jsonRequest("POST", { date, config, ...extra })
    );
    return { response, body: await response.json() };
  }

  it("creates a game", async () => {
    const { response, body } = await create();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.version).toBe(1);
    expect(body.game).toMatchObject({ id: body.id, status: "live", config });
  });

  it.each([
    ["malformed JSON", "{"],
    ["a missing config", { date }],
    ["an invalid config", { date, config: { regulationInnings: "9" } }],
  ])("rejects creation with %s", async (_label, body) => {
    const response = await handleCreateGame(
      database.db,
      jsonRequest("POST", body)
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_request",
    });
  });

  it("rejects an oversized body", async () => {
    const response = await handleCreateGame(
      database.db,
      jsonRequest("POST", { date, config, padding: "x".repeat(1_000_001) })
    );

    expect(response.status).toBe(413);
  });

  it("returns a game, 204 when unchanged, and 404 when unknown", async () => {
    const { body } = await create();
    const url = `http://test/api/games/${body.id}`;

    const found = await handleGetGame(database.db, body.id, new Request(url));
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual({
      game: body.game,
      version: 1,
    });

    const unchanged = await handleGetGame(
      database.db,
      body.id,
      new Request(`${url}?sinceVersion=1`)
    );
    expect(unchanged.status).toBe(204);

    const missing = await handleGetGame(
      database.db,
      "missing",
      new Request(url)
    );
    expect(missing.status).toBe(404);
  });

  it("saves, then rejects a stale save with the current game", async () => {
    const { body } = await create();
    const finished = { ...body.game, status: "finished" };

    const saved = await handleSaveGame(
      database.db,
      body.id,
      jsonRequest("PUT", {
        baseVersion: 1,
        mutationId: "mutation-1",
        game: finished,
      })
    );
    expect(saved.status).toBe(200);
    await expect(saved.json()).resolves.toEqual({ version: 2 });

    const stale = await handleSaveGame(
      database.db,
      body.id,
      jsonRequest("PUT", {
        baseVersion: 1,
        mutationId: "mutation-2",
        game: body.game,
      })
    );
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toEqual({
      error: "version_conflict",
      game: finished,
      version: 2,
    });
  });

  it("never stores device-only undo history", async () => {
    const { body } = await create();

    await handleSaveGame(
      database.db,
      body.id,
      jsonRequest("PUT", {
        baseVersion: 1,
        mutationId: "mutation-1",
        game: { ...body.game, undoHistory: [], redoHistory: [] },
      })
    );

    const found = await handleGetGame(
      database.db,
      body.id,
      new Request("http://test/api")
    );
    expect((await found.json()).game).toEqual(body.game);
  });

  it.each([
    ["a game id that differs from the URL", { id: "other" }, {}],
    ["a non-integer base version", {}, { baseVersion: "1" }],
    ["a missing mutation id", {}, { mutationId: "" }],
  ])("rejects a save with %s", async (_label, gamePatch, bodyPatch) => {
    const { body } = await create();

    const response = await handleSaveGame(
      database.db,
      body.id,
      jsonRequest("PUT", {
        baseVersion: 1,
        mutationId: "mutation-1",
        game: { ...body.game, ...gamePatch },
        ...bodyPatch,
      })
    );

    expect(response.status).toBe(400);
  });

  it.each([
    ["a date that is not a timestamp", { date: "yesterday" }],
    [
      "duplicate event ids",
      {
        events: [
          { id: "same", kind: "note", text: "first" },
          { id: "same", kind: "note", text: "second" },
        ],
      },
    ],
    [
      "an event id reused in the trash",
      {
        events: [{ id: "same", kind: "note", text: "first" }],
        deletedEvents: [
          { index: 0, event: { id: "same", kind: "note", text: "second" } },
        ],
      },
    ],
    [
      "duplicate player ids",
      {
        config: {
          ...config,
          teams: {
            away: {
              name: "Away",
              players: [{ id: "p1", name: "One", order: 1 }],
            },
            home: {
              name: "Home",
              players: [{ id: "p1", name: "Uno", order: 1 }],
            },
          },
        },
      },
    ],
  ])("rejects %s before it reaches the database", async (_label, patch) => {
    const { body } = await create();

    const response = await handleSaveGame(
      database.db,
      body.id,
      jsonRequest("PUT", {
        baseVersion: 1,
        mutationId: "mutation-1",
        game: { ...body.game, ...patch },
      })
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when saving an unknown game", async () => {
    const response = await handleSaveGame(
      database.db,
      "missing",
      jsonRequest("PUT", {
        baseVersion: 1,
        mutationId: "mutation-1",
        game: { id: "missing", date, status: "live", config, events: [] },
      })
    );

    expect(response.status).toBe(404);
  });
  describe("deleting", () => {
    function remove(gameId: string, body: unknown) {
      return handleDeleteGame(database.db, gameId, jsonRequest("DELETE", body));
    }

    it("deletes a game with its delete key", async () => {
      const { body } = await create({ deleteKey: "open sesame" });

      const response = await remove(body.id, { deleteKey: " open sesame " });

      expect(response.status).toBe(204);
      const found = await handleGetGame(
        database.db,
        body.id,
        new Request("http://test/api")
      );
      expect(found.status).toBe(404);
    });

    it("never reveals the key or its hash", async () => {
      const { body } = await create({ deleteKey: "open sesame" });
      const found = await handleGetGame(
        database.db,
        body.id,
        new Request("http://test/api")
      );
      const [row] = await database.db.select().from(games);

      const exposed = JSON.stringify([body, await found.json()]);
      expect(exposed).not.toContain("open sesame");
      expect(exposed).not.toContain(row.deleteKeyHash);
      expect(row.deleteKeyHash).not.toContain("open sesame");
    });

    it("keeps the key across saves", async () => {
      const { body } = await create({ deleteKey: "open sesame" });
      await handleSaveGame(
        database.db,
        body.id,
        jsonRequest("PUT", {
          baseVersion: 1,
          mutationId: "mutation-1",
          game: { ...body.game, status: "finished" },
        })
      );

      const response = await remove(body.id, { deleteKey: "open sesame" });

      expect(response.status).toBe(204);
    });

    it("refuses a wrong key and keeps the game", async () => {
      const { body } = await create({ deleteKey: "open sesame" });

      const response = await remove(body.id, { deleteKey: "open barley" });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "delete_key_mismatch",
      });
      const found = await handleGetGame(
        database.db,
        body.id,
        new Request("http://test/api")
      );
      expect(found.status).toBe(200);
    });

    it("refuses to delete a game created without a key", async () => {
      const { body } = await create();

      const response = await remove(body.id, { deleteKey: "open sesame" });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "delete_key_not_set",
      });
    });

    it("answers 404 for an unknown game", async () => {
      const response = await remove("missing", { deleteKey: "open sesame" });

      expect(response.status).toBe(404);
    });

    it.each([
      ["a missing key", {}],
      ["a blank key", { deleteKey: "  " }],
      ["a non-string key", { deleteKey: 1234 }],
    ])("rejects a delete with %s", async (_label, requestBody) => {
      const { body } = await create({ deleteKey: "open sesame" });

      const response = await remove(body.id, requestBody);

      expect(response.status).toBe(400);
    });

    it("rejects creation with a key that is too short", async () => {
      const { response } = await create({ deleteKey: "abc" });

      expect(response.status).toBe(400);
    });
  });
});
