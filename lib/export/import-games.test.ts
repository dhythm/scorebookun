import { describe, expect, it } from "vitest";

import type { PersistedGameV2 } from "../storage/local-storage";
import { exportGameAsJson } from "./game-log";
import { exportHistoryArchive } from "./history-archive";
import { parseImportedGames } from "./import-games";

const game: PersistedGameV2 = {
  id: "game-1",
  date: "2026-09-19T00:00:00.000Z",
  status: "finished",
  config: {
    regulationInnings: 7,
    teams: {
      away: { name: "Away", players: [] },
      home: { name: "Home", players: [] },
    },
  },
  events: [{ id: "note", kind: "note", text: "rain delay" }],
};

describe("parseImportedGames", () => {
  it("reads a file exported from the game history", () => {
    const exported = exportHistoryArchive([game, { ...game, id: "game-2" }]);

    expect(parseImportedGames(exported).map((imported) => imported.id)).toEqual(
      ["game-1", "game-2"]
    );
  });

  it("reads a file exported from a single game", () => {
    expect(parseImportedGames(exportGameAsJson(game))).toEqual([game]);
  });

  it.each([
    ["text that is not an export", "hello"],
    ["an unrelated file", '{"name":"package"}'],
    ["a damaged game", '{"schemaVersion":2,"game":{"id":1}}'],
  ])("rejects %s", (_label, serialized) => {
    expect(() => parseImportedGames(serialized)).toThrow(
      "unsupported import file"
    );
  });
});
