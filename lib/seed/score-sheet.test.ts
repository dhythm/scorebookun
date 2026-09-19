import { describe, expect, it } from "vitest";

import { replay } from "@/lib/domain/replay";
import type { GameConfig, Player } from "@/lib/domain/types";

import { createScoreSheet } from "./score-sheet";

function lineup(prefix: string): Player[] {
  return Array.from({ length: 9 }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    name: `${prefix}${index + 1}`,
    order: index + 1,
  }));
}

const config: GameConfig = {
  regulationInnings: 7,
  teams: {
    away: { name: "Away", players: lineup("a") },
    home: { name: "Home", players: lineup("h") },
  },
};

describe("createScoreSheet", () => {
  it("records plays for whoever is at bat, with conventional advances", () => {
    const sheet = createScoreSheet("test", config);

    sheet.plays("1B7 SB 1B9 K G6 F8");

    const events = sheet.events();
    expect(events.map((event) => event.id)).toEqual([
      "test-1",
      "test-2",
      "test-3",
      "test-4",
      "test-5",
      "test-6",
    ]);
    expect(events[0]).toMatchObject({
      kind: "atBat",
      batterId: "a1",
      result: "single",
      battedBall: { position: "left", type: "liner" },
    });
    expect(events[1]).toMatchObject({
      kind: "baseRunning",
      type: "steal",
      movements: [{ playerId: "a1", from: "first", to: "second" }],
    });
    const { snapshot, violations } = replay(events, config);
    expect(violations).toEqual([]);
    expect(snapshot).toMatchObject({
      inning: 1,
      half: "bottom",
      score: { away: 1, home: 0 },
    });
  });

  it("rejects an unknown play code instead of guessing", () => {
    const sheet = createScoreSheet("test", config);

    expect(() => sheet.plays("K XYZ")).toThrow('Unknown play code "XYZ"');
  });

  it("fails loudly when a play breaks the rules", () => {
    const sheet = createScoreSheet("test", config);

    expect(() => sheet.plays("SB")).toThrow("no runner");
  });
});
