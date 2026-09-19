import { describe, expect, it } from "vitest";

import { evaluateEventDeletion, gameReducer } from "../app-state/reducer";
import { formatEventNotation } from "./notation";
import { replay } from "./replay";
import { getPlayerBattingStats } from "./stats";
import type { AtBatEvent, GameConfig, GameEvent } from "./types";

const config: GameConfig = {
  regulationInnings: 9,
  teams: {
    away: {
      name: "Away",
      players: ["runner", "batter", "other"].map((id, index) => ({
        id,
        name: id,
        order: index + 1,
      })),
    },
    home: { name: "Home", players: [{ id: "home", name: "Home", order: 1 }] },
  },
};

const fly: AtBatEvent = {
  id: "fly",
  kind: "atBat",
  batterId: "batter",
  result: "flyOut",
  battedBall: { position: "center", type: "fly", depth: "deep" },
  movements: [
    { playerId: "runner", from: "third", to: "home", isRBI: true },
    { playerId: "batter", from: "batter", to: "out", isRBI: false },
  ],
};

function setup(outs: number): GameEvent[] {
  return [
    ...Array.from({ length: outs }, (_, index): AtBatEvent => ({
      id: `out-${index}`,
      kind: "atBat",
      batterId: config.teams.away.players[index].id,
      result: "strikeout",
      movements: [
        {
          playerId: config.teams.away.players[index].id,
          from: "batter",
          to: "out",
          isRBI: false,
        },
      ],
    })),
    {
      id: "placement",
      kind: "runnerPlacement",
      runners: { first: "other", second: null, third: "runner" },
    },
  ];
}

function play(outs: number, event = fly) {
  const result = replay([...setup(outs), event], config);
  expect(result.timeline.at(-1)?.applied).toBe(true);
  return result;
}

describe("sacrifice fly derivation", () => {
  it.each([0, 1])(
    "recognizes a recorded fly and scoring runner with %i outs",
    (outs) => {
      const result = play(outs);
      const entry = result.timeline.at(-1)!;
      expect(entry.runsScored).toBe(1);
      expect(entry.event).toMatchObject({ result: "sacrificeFly" });
      expect(formatEventNotation(entry.event)).toBe("中犠飛");
      expect(getPlayerBattingStats(result.timeline, "batter")).toMatchObject({
        plateAppearances: 1,
        atBats: 0,
        rbi: 1,
        sacrificeFlies: 1,
      });
      expect(fly.result).toBe("flyOut");
    }
  );

  it.each(["flyOut", "sacrificeFly"] as const)(
    "does not credit %s with two outs",
    (result) => {
      const replayResult = play(2, { ...fly, result });
      expect(replayResult.timeline.at(-1)).toMatchObject({
        runsScored: 0,
        event: { result: "flyOut" },
      });
      expect(
        getPlayerBattingStats(replayResult.timeline, "batter")
      ).toMatchObject({ atBats: 2, rbi: 0, sacrificeFlies: 0 });
    }
  );

  it("removes a sacrifice when a force third out cancels the run", () => {
    const result = play(1, {
      ...fly,
      result: "sacrificeFly",
      movements: [
        ...fly.movements,
        {
          playerId: "other",
          from: "first",
          to: "out",
          outType: "force",
          isRBI: false,
        },
      ],
    });
    expect(result.timeline.at(-1)).toMatchObject({
      runsScored: 0,
      event: { result: "flyOut" },
    });
    expect(getPlayerBattingStats(result.timeline, "batter")).toMatchObject({
      atBats: 1,
      rbi: 0,
      sacrificeFlies: 0,
    });
  });

  it("keeps a sacrifice when the run precedes a tag third out", () => {
    const result = play(1, {
      ...fly,
      movements: [
        fly.movements[1],
        fly.movements[0],
        {
          playerId: "other",
          from: "first",
          to: "out",
          outType: "tag",
          isRBI: false,
        },
      ],
    });
    expect(result.timeline.at(-1)).toMatchObject({
      runsScored: 1,
      event: { result: "sacrificeFly" },
    });
  });

  it("respects a scorer's decision that a run was not batted in", () => {
    const result = play(0, {
      ...fly,
      movements: fly.movements.map((movement) => ({
        ...movement,
        isRBI: false,
      })),
    });
    expect(result.timeline.at(-1)).toMatchObject({
      runsScored: 1,
      event: { result: "flyOut" },
    });
  });

  it("recalculates existing records after editing a scoring runner to stay at third", () => {
    const game = gameReducer(null, {
      type: "LOAD_GAME",
      game: {
        id: "saved-game",
        date: "2026-09-20T00:00:00.000Z",
        status: "live",
        config,
        events: [...setup(0), { ...fly, result: "sacrificeFly" }],
      },
    })!;
    const edited = gameReducer(game, {
      type: "UPDATE_EVENT",
      eventId: fly.id,
      event: { ...fly, result: "sacrificeFly", movements: [fly.movements[1]] },
    })!;
    expect(edited.currentState.score.away).toBe(0);
    expect(edited.timeline.at(-1)?.event).toMatchObject({ result: "flyOut" });
    expect(getPlayerBattingStats(edited.timeline, "batter")).toMatchObject({
      atBats: 1,
      rbi: 0,
      sacrificeFlies: 0,
    });
  });

  it("preserves a scorer-credited sacrifice on a dropped catch", () => {
    // First must be vacated for this dropped-catch scenario.
    const replayResult = replay(
      [
        {
          id: "placement",
          kind: "runnerPlacement",
          runners: { first: null, second: null, third: "runner" },
        },
        {
          ...fly,
          result: "sacrificeFly",
          movements: [fly.movements[0], { ...fly.movements[1], to: "first" }],
        },
      ],
      config
    );
    expect(replayResult.timeline.at(-1)).toMatchObject({
      applied: true,
      event: { result: "sacrificeFly" },
    });
    expect(
      getPlayerBattingStats(replayResult.timeline, "batter")
    ).toMatchObject({ atBats: 0, sacrificeFlies: 1 });
  });

  it("reports an invalidated normalized fly after removing its runner placement", () => {
    const game = gameReducer(null, {
      type: "LOAD_GAME",
      game: {
        id: "saved-game",
        date: "2026-09-20T00:00:00.000Z",
        status: "live",
        config,
        events: [...setup(0), fly],
      },
    })!;
    expect(game.timeline.at(-1)?.event).toMatchObject({
      result: "sacrificeFly",
    });
    expect(
      evaluateEventDeletion(game, "placement")?.invalidatedEventIds
    ).toEqual(["fly"]);
  });
});
