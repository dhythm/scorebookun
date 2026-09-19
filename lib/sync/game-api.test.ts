import { describe, expect, it, vi } from "vitest";

import { createGameApi } from "./game-api";
import type { SharedGame } from "./shared-game";

const game: SharedGame = {
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
  events: [],
};

function apiReturning(response: Response | Error) {
  const fetchFn = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { api: createGameApi(fetchFn), fetchFn };
}

describe("createGameApi", () => {
  it("creates a game", async () => {
    const { api, fetchFn } = apiReturning(
      Response.json({ id: "game-1", game, version: 1 }, { status: 201 })
    );

    await expect(
      api.create({ date: game.date, config: game.config })
    ).resolves.toEqual({ status: "created", id: "game-1", game, version: 1 });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/games",
      expect.objectContaining({ method: "POST", cache: "no-store" })
    );
  });

  it("fetches with the known version and understands 204 and 404", async () => {
    const unchanged = apiReturning(new Response(null, { status: 204 }));
    await expect(unchanged.api.fetch("game 1", 3)).resolves.toEqual({
      status: "unchanged",
    });
    expect(unchanged.fetchFn).toHaveBeenCalledWith(
      "/api/games/game%201?sinceVersion=3",
      expect.anything()
    );

    const missing = apiReturning(Response.json({}, { status: 404 }));
    await expect(missing.api.fetch("game-1")).resolves.toEqual({
      status: "notFound",
    });
  });

  it("returns the server game on a version conflict", async () => {
    const { api } = apiReturning(
      Response.json({ game, version: 4 }, { status: 409 })
    );

    await expect(
      api.save({ id: "game-1", baseVersion: 1, mutationId: "m", game })
    ).resolves.toEqual({ status: "conflict", game, version: 4 });
  });

  it.each([
    ["a network failure", new TypeError("Failed to fetch")],
    ["a server failure", Response.json({}, { status: 503 })],
    ["an unreadable response", Response.json({ version: "2" })],
  ])("reports %s as unavailable instead of throwing", async (_label, reply) => {
    const { api } = apiReturning(reply);

    await expect(
      api.save({ id: "game-1", baseVersion: 1, mutationId: "m", game })
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("reports a refused request", async () => {
    const { api } = apiReturning(Response.json({}, { status: 400 }));

    await expect(
      api.save({ id: "game-1", baseVersion: 1, mutationId: "m", game })
    ).resolves.toEqual({ status: "rejected" });
  });
  it("sends the delete key beside the new game", async () => {
    const { api, fetchFn } = apiReturning(
      Response.json({ id: "game-1", game, version: 1 }, { status: 201 })
    );

    await api.create({
      date: game.date,
      config: game.config,
      deleteKey: "open sesame",
    });

    const init = fetchFn.mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toEqual({
      date: game.date,
      config: game.config,
      deleteKey: "open sesame",
    });
  });

  it("deletes a game, sending the key in the body and not the URL", async () => {
    const { api, fetchFn } = apiReturning(new Response(null, { status: 204 }));

    await expect(api.delete("game 1", "open sesame")).resolves.toEqual({
      status: "deleted",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/games/game%201",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ deleteKey: "open sesame" }),
      })
    );
  });

  it.each([
    [403, { error: "delete_key_mismatch" }, "wrongKey"],
    [403, { error: "delete_key_not_set" }, "noKey"],
    [404, { error: "not_found" }, "notFound"],
    [400, { error: "invalid_request" }, "rejected"],
    [503, { error: "unavailable" }, "unavailable"],
  ])("reads a %i %j delete reply as %s", async (status, body, expected) => {
    const { api } = apiReturning(Response.json(body, { status }));

    await expect(api.delete("game-1", "open sesame")).resolves.toEqual({
      status: expected,
    });
  });
});
