import { describe, expect, it } from "vitest";

import { replay } from "@/lib/domain/replay";
import { fromGameRows, toGameRows } from "@/lib/server/game-rows";
import { parseSharedGame } from "@/lib/sync/shared-game";

import { createSeedGames } from "./seed-games";

const EXPECTED = {
  "seed-before-first-pitch": {
    status: "live",
    at: "1 top",
    outs: 0,
    score: "0-0",
  },
  "seed-live-pitchers-duel": {
    status: "live",
    at: "3 top",
    outs: 2,
    score: "0-0",
  },
  "seed-live-slugfest": {
    status: "live",
    at: "3 bottom",
    outs: 1,
    score: "6-10",
  },
  "seed-live-last-chance": {
    status: "live",
    at: "7 bottom",
    outs: 2,
    score: "2-2",
  },
  "seed-live-extra-innings": {
    status: "live",
    at: "8 top",
    outs: 1,
    score: "2-2",
  },
  "seed-finished-walk-off": {
    status: "finished",
    at: "7 bottom",
    outs: 1,
    score: "2-4",
    endReason: "walkOff",
  },
  "seed-finished-shutout": {
    status: "finished",
    at: "7 bottom",
    outs: 0,
    score: "0-3",
    endReason: "homeAheadAfterTop",
  },
  "seed-finished-called-game": {
    status: "finished",
    at: "5 top",
    outs: 2,
    score: "4-1",
    endReason: "manual",
  },
} as const;

describe("seed games", () => {
  const seedGames = createSeedGames();

  it("cover the time before, during, and after a game", () => {
    expect(seedGames.map(({ game }) => game.id)).toEqual(Object.keys(EXPECTED));
  });

  it.each(seedGames.map((seed) => [seed.game.id, seed] as const))(
    "%s replays without violations into its documented state",
    (id, { game, summary }) => {
      const { snapshot, violations } = replay(game.events, game.config);

      expect(violations).toEqual([]);
      expect(summary).not.toBe("");
      expect({
        status: game.status,
        at: `${snapshot.inning} ${snapshot.half}`,
        outs: snapshot.outs,
        score: `${snapshot.score.away}-${snapshot.score.home}`,
        ...(snapshot.gameEndReason && { endReason: snapshot.gameEndReason }),
      }).toEqual(EXPECTED[id as keyof typeof EXPECTED]);
    }
  );

  it.each(seedGames.map((seed) => [seed.game.id, seed.game] as const))(
    "%s passes the API validation and survives the database row mapping",
    (_id, game) => {
      expect(parseSharedGame(game)).toEqual(game);
      expect(fromGameRows(toGameRows(game))).toEqual(game);
    }
  );

  it("leaves the bases loaded with two outs for a walk-off chance", () => {
    const game = seedGames.find(
      (seed) => seed.game.id === "seed-live-last-chance"
    )!.game;

    const { runners } = replay(game.events, game.config).snapshot;

    expect(Object.values(runners).every(Boolean)).toBe(true);
  });

  it("is deterministic, so reseeding restores the same games", () => {
    expect(createSeedGames()).toEqual(seedGames);
  });
});
