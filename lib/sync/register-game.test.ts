import { describe, expect, it, vi } from "vitest";

import type { GameApi } from "./game-api";
import { registerGame } from "./register-game";
import type { SharedGame } from "./shared-game";

const recorded: SharedGame = {
  id: "device-only-id",
  date: "2026-09-19T00:00:00.000Z",
  status: "finished",
  config: {
    regulationInnings: 9,
    teams: {
      away: { name: "Away", players: [] },
      home: { name: "Home", players: [] },
    },
  },
  events: [{ id: "note", kind: "note", text: "rain delay" }],
};

function apiWith(save: GameApi["save"]) {
  return {
    create: vi.fn<GameApi["create"]>(async ({ date, config }) => ({
      status: "created",
      id: "server-id",
      version: 1,
      game: { id: "server-id", date, status: "live", config, events: [] },
    })),
    save: vi.fn(save),
  };
}

describe("registerGame", () => {
  it("creates the game and uploads its recorded plays under the new id", async () => {
    const api = apiWith(async () => ({ status: "saved", version: 2 }));

    const registered = await registerGame(api, recorded, () => "mutation-1");

    expect(registered).toEqual({
      game: { ...recorded, id: "server-id" },
      version: 2,
    });
    expect(api.save).toHaveBeenCalledWith({
      id: "server-id",
      baseVersion: 1,
      mutationId: "mutation-1",
      game: { ...recorded, id: "server-id" },
    });
  });

  it("does not upload when there is nothing recorded yet", async () => {
    const api = apiWith(async () => ({ status: "saved", version: 2 }));
    const fresh: SharedGame = { ...recorded, status: "live", events: [] };

    const registered = await registerGame(api, fresh, () => "mutation-1");

    expect(registered).toEqual({
      game: { ...fresh, id: "server-id" },
      version: 1,
    });
    expect(api.save).not.toHaveBeenCalled();
  });

  it("returns null when the server cannot be reached", async () => {
    const api = apiWith(async () => ({ status: "unavailable" }));

    await expect(
      registerGame(api, recorded, () => "mutation-1")
    ).resolves.toBeNull();
  });
  it("passes the delete key to the server when one is given", async () => {
    const api = apiWith(async () => ({ status: "saved", version: 2 }));

    await registerGame(api, recorded, () => "mutation-1", "open sesame");

    expect(api.create).toHaveBeenCalledWith({
      date: recorded.date,
      config: recorded.config,
      deleteKey: "open sesame",
    });
  });
});
