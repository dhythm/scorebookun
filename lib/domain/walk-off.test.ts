import { describe, expect, it } from "vitest";

import { gameReducer } from "../app-state/reducer";
import { getPitcherStats } from "./pitching";
import { replay } from "./replay";
import { getDefaultMovements } from "./rules";
import { getInningScores, getPlayerBattingStats } from "./stats";
import type {
  AtBatEvent,
  AtBatResult,
  GameConfig,
  GameEvent,
  Runners,
} from "./types";

const config: GameConfig = {
  regulationInnings: 1,
  teams: {
    away: {
      name: "Away",
      players: [{ id: "away", name: "Away", order: 1, position: "pitcher" }],
    },
    home: {
      name: "Home",
      players: [1, 2, 3, 4].map((order) => ({
        id: `home-${order}`,
        name: `Home ${order}`,
        order,
      })),
    },
  },
};

function loadedBasesEvents(awayRuns = 0): GameEvent[] {
  const events: GameEvent[] = Array.from({ length: awayRuns }, (_, index) => ({
    id: `away-run-${index}`,
    kind: "atBat",
    batterId: "away",
    result: "homerun",
    movements: [{ playerId: "away", from: "batter", to: "home", isRBI: true }],
  }));
  for (let index = 0; index < 3; index++) {
    events.push({
      id: `away-out-${index}`,
      kind: "atBat",
      batterId: "away",
      result: "strikeout",
      movements: [
        { playerId: "away", from: "batter", to: "out", isRBI: false },
      ],
    });
  }
  const runners: Runners = { first: null, second: null, third: null };
  for (let order = 1; order <= 3; order++) {
    const batterId = `home-${order}`;
    events.push({
      id: `walk-${order}`,
      kind: "atBat",
      batterId,
      result: "walk",
      movements: getDefaultMovements("walk", runners, batterId),
    });
    runners.third = runners.second;
    runners.second = runners.first;
    runners.first = batterId;
  }
  return events;
}

function scoringHit(result: AtBatResult = "single"): AtBatEvent {
  return {
    id: "winning-hit",
    kind: "atBat",
    batterId: "home-4",
    result,
    movements: [
      { playerId: "home-1", from: "third", to: "home", isRBI: true },
      { playerId: "home-2", from: "second", to: "home", isRBI: true },
      { playerId: "home-3", from: "first", to: "home", isRBI: true },
      {
        playerId: "home-4",
        from: "batter",
        to: result === "homerun" ? "home" : "first",
        isRBI: result === "homerun",
      },
    ],
  };
}

describe("walk-off scoring", () => {
  it.each([
    { awayRuns: 0, expectedRuns: 1 },
    { awayRuns: 1, expectedRuns: 2 },
  ])(
    "counts only the winning run after a $awayRuns-run deficit",
    ({ awayRuns, expectedRuns }) => {
      const events = [...loadedBasesEvents(awayRuns), scoringHit()];
      const recorded = JSON.stringify(events);
      const result = replay(events, config);
      const winningPlay = result.timeline.at(-1)!;

      expect(result.violations).toEqual([]);
      expect(result.snapshot).toMatchObject({
        score: { away: awayRuns, home: expectedRuns },
        gameStatus: "finished",
        gameEndReason: "walkOff",
      });
      expect(winningPlay.runsScored).toBe(expectedRuns);
      expect(
        winningPlay.scoringMovements.map(({ playerId }) => playerId)
      ).toEqual(["home-1", "home-2", "home-3"].slice(0, expectedRuns));
      expect(getInningScores(result.timeline, 1).homeTotal).toBe(expectedRuns);
      expect(getPlayerBattingStats(result.timeline, "home-4").rbi).toBe(
        expectedRuns
      );
      for (let order = 1; order <= 3; order++) {
        expect(
          getPlayerBattingStats(result.timeline, `home-${order}`).runs
        ).toBe(order <= expectedRuns ? 1 : 0);
      }
      expect(
        getPitcherStats(result.timeline, "away", "away")[0].runsAllowed
      ).toBe(expectedRuns);
      expect(JSON.stringify(events)).toBe(recorded);
      expect(winningPlay.event).toMatchObject({
        movements: scoringHit().movements,
      });
    }
  );

  it("counts every runner on a walk-off home run", () => {
    const result = replay(
      [...loadedBasesEvents(), scoringHit("homerun")],
      config
    );

    expect(result.snapshot.score.home).toBe(4);
    expect(result.snapshot.gameEndReason).toBe("walkOff");
    expect(result.timeline.at(-1)!.scoringMovements).toHaveLength(4);
    expect(getPlayerBattingStats(result.timeline, "home-4")).toMatchObject({
      rbi: 4,
      runs: 1,
    });
  });

  it("credits the lead runner even when recorded movements list trailing runners first", () => {
    const hit = scoringHit();
    hit.movements.reverse();
    const result = replay([...loadedBasesEvents(), hit], config);

    expect(
      result.timeline.at(-1)!.scoringMovements.map(({ playerId }) => playerId)
    ).toEqual(["home-1"]);
    expect(getPlayerBattingStats(result.timeline, "home-1").runs).toBe(1);
    expect(getPlayerBattingStats(result.timeline, "home-3").runs).toBe(0);
    expect(hit.movements[0].from).toBe("batter");
  });

  it("keeps all runs before the regulation final inning", () => {
    const result = replay([...loadedBasesEvents(), scoringHit()], {
      ...config,
      regulationInnings: 2,
    });

    expect(result.snapshot.score.home).toBe(3);
    expect(result.snapshot.gameStatus).toBe("live");
    expect(result.timeline.at(-1)!.scoringMovements).toHaveLength(3);
  });

  it("continues when the scoring play only ties the game", () => {
    const result = replay([...loadedBasesEvents(3), scoringHit()], config);

    expect(result.snapshot.score).toEqual({ away: 3, home: 3 });
    expect(result.snapshot.gameStatus).toBe("live");
  });

  it("limits a walk-off base-running play as well", () => {
    const result = replay(
      [
        ...loadedBasesEvents(),
        {
          id: "wild-pitch",
          kind: "baseRunning",
          type: "wildPitch",
          movements: [
            { playerId: "home-1", from: "third", to: "home", isRBI: false },
            { playerId: "home-2", from: "second", to: "home", isRBI: false },
          ],
        },
      ],
      config
    );

    expect(result.snapshot.score.home).toBe(1);
    expect(result.snapshot.gameEndReason).toBe("walkOff");
    expect(getPlayerBattingStats(result.timeline, "home-2").runs).toBe(0);
  });

  it("recalculates a saved game while keeping the original recorded movements", () => {
    const events = [...loadedBasesEvents(), scoringHit()];
    const game = gameReducer(null, {
      type: "LOAD_GAME",
      game: {
        id: "saved-walk-off",
        date: "2026-09-20T00:00:00.000Z",
        status: "finished",
        config,
        events,
      },
    })!;

    expect(game.currentState.score.home).toBe(1);
    expect(game.events).toEqual(events);
    expect(getPlayerBattingStats(game.timeline, "home-4").rbi).toBe(1);
    expect(getPlayerBattingStats(game.timeline, "home-2").runs).toBe(0);
  });
});
