import { describe, expect, it } from "vitest";

import type {
  AtBatEvent,
  BaseRunningEvent,
  RunnerMovement,
  Snapshot,
  SubstitutionEvent,
  TimelineEntry,
} from "./types";
import { getPitcherStats, getStartingPitcherStats } from "./pitching";

const snapshot: Snapshot = {
  inning: 1,
  half: "top",
  outs: 0,
  runners: { first: null, second: null, third: null },
  activeLineup: { away: ["away-batter"], home: ["home-batter"] },
  activePitcherId: { away: null, home: null },
  fieldingPositions: { away: {}, home: {} },
  currentBatterIndex: { away: 0, home: 0 },
  score: { away: 0, home: 0 },
  gameStatus: "live",
};

function entry(
  id: string,
  team: "away" | "home",
  result: AtBatEvent["result"],
  outsRecorded = 0,
  runsScored = 0
): TimelineEntry {
  const event: AtBatEvent = {
    id,
    kind: "atBat",
    batterId: `${team}-batter`,
    result,
    movements: [],
  };
  return {
    event,
    index: 0,
    inning: 1,
    half: team === "away" ? "top" : "bottom",
    team,
    outsBefore: 0,
    outsAfter: outsRecorded,
    outsRecorded,
    runsScored,
    scoringMovements: [],
    applied: true,
    before: snapshot,
    after: snapshot,
  };
}

function movement(
  playerId: string,
  from: RunnerMovement["from"],
  to: RunnerMovement["to"]
): RunnerMovement {
  return { playerId, from, to, isRBI: false };
}

function entryWithMovements({
  id,
  result,
  movements,
  scoringMovements = [],
  outsRecorded = 0,
  outsAfter = outsRecorded,
  after = snapshot,
}: {
  id: string;
  result: AtBatEvent["result"];
  movements: RunnerMovement[];
  scoringMovements?: RunnerMovement[];
  outsRecorded?: number;
  outsAfter?: number;
  after?: Snapshot;
}): TimelineEntry {
  const base = entry(id, "away", result, outsRecorded, scoringMovements.length);
  const event: AtBatEvent = {
    id,
    kind: "atBat",
    batterId: id,
    result,
    movements,
  };
  return {
    ...base,
    event,
    outsAfter,
    scoringMovements,
    after,
  };
}

function substitutionEntry(event: SubstitutionEvent): TimelineEntry {
  return {
    ...entry(event.id, "away", "otherOut"),
    event,
    outsRecorded: 0,
  };
}

describe("getStartingPitcherStats", () => {
  it("derives the defensive starter line from opponent plate appearances", () => {
    const timeline = [
      entry("single", "away", "single"),
      entry("walk", "away", "walk"),
      entry("strikeout", "away", "strikeoutSwinging", 1),
      entry("groundout", "away", "groundOut", 1, 1),
      entry("home-offense", "home", "homerun", 0, 2),
    ];

    expect(getStartingPitcherStats(timeline, "home")).toEqual({
      outs: 2,
      inningsPitched: "0.2",
      hitsAllowed: 1,
      runsAllowed: 1,
      walksAllowed: 1,
      strikeouts: 1,
    });
  });

  it("stops charging the starter after a pitching substitution", () => {
    const pitchingChange: SubstitutionEvent = {
      id: "pitching-change",
      kind: "substitution",
      team: "home",
      inPlayerId: "home-reliever",
      outPlayerId: "home-batter",
      role: "pitcher",
    };
    const substitutionEntry: TimelineEntry = {
      ...entry("placeholder", "away", "otherOut"),
      event: pitchingChange,
      outsRecorded: 0,
    };

    expect(
      getStartingPitcherStats(
        [
          entry("single", "away", "single"),
          substitutionEntry,
          entry("reliever-walk", "away", "walk"),
        ],
        "home"
      )
    ).toMatchObject({
      hitsAllowed: 1,
      walksAllowed: 0,
    });
  });

  it("derives separate lines for the starter and each reliever", () => {
    const firstChange: SubstitutionEvent = {
      id: "first-change",
      kind: "substitution",
      team: "home",
      inPlayerId: "reliever-1",
      outPlayerId: "starter",
      role: "pitcher",
    };
    const secondChange: SubstitutionEvent = {
      ...firstChange,
      id: "second-change",
      inPlayerId: "reliever-2",
      outPlayerId: "reliever-1",
    };
    const changeEntry = (event: SubstitutionEvent): TimelineEntry => ({
      ...entry(event.id, "away", "otherOut"),
      event,
      outsRecorded: 0,
    });

    expect(
      getPitcherStats(
        [
          entry("starter-single", "away", "single"),
          entry("starter-out", "away", "groundOut", 1, 1),
          changeEntry(firstChange),
          entry("reliever-walk", "away", "walk"),
          entry("reliever-k", "away", "strikeoutLooking", 1),
          changeEntry(secondChange),
          entry("second-reliever-hr", "away", "homerun", 0, 1),
        ],
        "home",
        "starter"
      )
    ).toEqual([
      {
        pitcherId: "starter",
        role: "starter",
        outs: 1,
        inningsPitched: "0.1",
        hitsAllowed: 1,
        runsAllowed: 1,
        walksAllowed: 0,
        strikeouts: 0,
      },
      {
        pitcherId: "reliever-1",
        role: "reliever",
        outs: 1,
        inningsPitched: "0.1",
        hitsAllowed: 0,
        runsAllowed: 0,
        walksAllowed: 1,
        strikeouts: 1,
      },
      {
        pitcherId: "reliever-2",
        role: "reliever",
        outs: 0,
        inningsPitched: "0.0",
        hitsAllowed: 1,
        runsAllowed: 1,
        walksAllowed: 0,
        strikeouts: 0,
      },
    ]);
  });

  it("supports a starter without a batting-order player id", () => {
    expect(
      getPitcherStats(
        [entry("starter-out", "away", "groundOut", 1)],
        "home",
        null
      )
    ).toEqual([
      expect.objectContaining({
        pitcherId: null,
        role: "starter",
        outs: 1,
      }),
    ]);
  });

  it("charges a starter for an inherited runner who scores off a reliever", () => {
    const pitchingChange: SubstitutionEvent = {
      id: "pitching-change",
      kind: "substitution",
      team: "home",
      inPlayerId: "reliever",
      outPlayerId: "starter",
      role: "pitcher",
    };
    const inheritedRun = movement("starter-runner", "first", "home");

    expect(
      getPitcherStats(
        [
          entryWithMovements({
            id: "starter-runner",
            result: "single",
            movements: [movement("starter-runner", "batter", "first")],
          }),
          substitutionEntry(pitchingChange),
          entryWithMovements({
            id: "reliever-batter",
            result: "double",
            movements: [
              inheritedRun,
              movement("reliever-batter", "batter", "second"),
            ],
            scoringMovements: [inheritedRun],
          }),
        ],
        "home",
        "starter"
      )
    ).toEqual([
      expect.objectContaining({ pitcherId: "starter", runsAllowed: 1 }),
      expect.objectContaining({ pitcherId: "reliever", runsAllowed: 0 }),
    ]);
  });

  it("keeps responsibility with the original pitcher after a pinch runner enters", () => {
    const pitchingChange: SubstitutionEvent = {
      id: "pitching-change",
      kind: "substitution",
      team: "home",
      inPlayerId: "reliever",
      outPlayerId: "starter",
      role: "pitcher",
    };
    const pinchRunner: SubstitutionEvent = {
      id: "pinch-runner",
      kind: "substitution",
      team: "away",
      inPlayerId: "pinch-runner",
      outPlayerId: "starter-runner",
      role: "pinchRunner",
    };
    const inheritedRun = movement("pinch-runner", "first", "home");

    const stats = getPitcherStats(
      [
        entryWithMovements({
          id: "starter-runner",
          result: "walk",
          movements: [movement("starter-runner", "batter", "first")],
        }),
        substitutionEntry(pitchingChange),
        substitutionEntry(pinchRunner),
        entryWithMovements({
          id: "reliever-batter",
          result: "single",
          movements: [
            inheritedRun,
            movement("reliever-batter", "batter", "first"),
          ],
          scoringMovements: [inheritedRun],
        }),
      ],
      "home",
      "starter"
    );

    expect(stats).toEqual([
      expect.objectContaining({ pitcherId: "starter", runsAllowed: 1 }),
      expect.objectContaining({ pitcherId: "reliever", runsAllowed: 0 }),
    ]);
  });

  it("charges a reliever for a runner the reliever allowed to reach base", () => {
    const pitchingChange: SubstitutionEvent = {
      id: "pitching-change",
      kind: "substitution",
      team: "home",
      inPlayerId: "reliever",
      outPlayerId: "starter",
      role: "pitcher",
    };
    const relieverRun = movement("reliever-runner", "first", "home");

    const stats = getPitcherStats(
      [
        substitutionEntry(pitchingChange),
        entryWithMovements({
          id: "reliever-runner",
          result: "walk",
          movements: [movement("reliever-runner", "batter", "first")],
        }),
        entryWithMovements({
          id: "next-batter",
          result: "double",
          movements: [relieverRun, movement("next-batter", "batter", "second")],
          scoringMovements: [relieverRun],
        }),
      ],
      "home",
      "starter"
    );

    expect(stats).toEqual([
      expect.objectContaining({ pitcherId: "starter", runsAllowed: 0 }),
      expect.objectContaining({ pitcherId: "reliever", runsAllowed: 1 }),
    ]);
  });

  it("attributes runners independently across multiple pitching changes", () => {
    const firstChange: SubstitutionEvent = {
      id: "first-change",
      kind: "substitution",
      team: "home",
      inPlayerId: "reliever-1",
      outPlayerId: "starter",
      role: "pitcher",
    };
    const secondChange: SubstitutionEvent = {
      ...firstChange,
      id: "second-change",
      inPlayerId: "reliever-2",
      outPlayerId: "reliever-1",
    };
    const starterRun = movement("starter-runner", "second", "home");
    const firstRelieverRun = movement("first-reliever-runner", "first", "home");

    const stats = getPitcherStats(
      [
        entryWithMovements({
          id: "starter-runner",
          result: "double",
          movements: [movement("starter-runner", "batter", "second")],
        }),
        substitutionEntry(firstChange),
        entryWithMovements({
          id: "first-reliever-runner",
          result: "walk",
          movements: [
            movement("starter-runner", "second", "third"),
            movement("first-reliever-runner", "batter", "first"),
          ],
        }),
        substitutionEntry(secondChange),
        entryWithMovements({
          id: "second-reliever-batter",
          result: "double",
          movements: [
            starterRun,
            firstRelieverRun,
            movement("second-reliever-batter", "batter", "second"),
          ],
          scoringMovements: [starterRun, firstRelieverRun],
        }),
      ],
      "home",
      "starter"
    );

    expect(stats).toEqual([
      expect.objectContaining({ pitcherId: "starter", runsAllowed: 1 }),
      expect.objectContaining({ pitcherId: "reliever-1", runsAllowed: 1 }),
      expect.objectContaining({ pitcherId: "reliever-2", runsAllowed: 0 }),
    ]);
  });

  it("forgets pitcher responsibility when a runner is put out", () => {
    const runnerOut: BaseRunningEvent = {
      id: "runner-out",
      kind: "baseRunning",
      type: "caughtStealing",
      movements: [movement("same-player", "first", "out")],
    };
    const runnerOutEntry: TimelineEntry = {
      ...entry("runner-out-placeholder", "away", "otherOut", 1),
      event: runnerOut,
    };
    const pitchingChange: SubstitutionEvent = {
      id: "pitching-change",
      kind: "substitution",
      team: "home",
      inPlayerId: "reliever",
      outPlayerId: "starter",
      role: "pitcher",
    };
    const relieverRun = movement("same-player", "first", "home");

    const stats = getPitcherStats(
      [
        entryWithMovements({
          id: "same-player",
          result: "single",
          movements: [movement("same-player", "batter", "first")],
        }),
        runnerOutEntry,
        substitutionEntry(pitchingChange),
        entryWithMovements({
          id: "same-player",
          result: "walk",
          movements: [movement("same-player", "batter", "first")],
        }),
        entryWithMovements({
          id: "next-batter",
          result: "double",
          movements: [relieverRun, movement("next-batter", "batter", "second")],
          scoringMovements: [relieverRun],
        }),
      ],
      "home",
      "starter"
    );

    expect(stats).toEqual([
      expect.objectContaining({ pitcherId: "starter", runsAllowed: 0 }),
      expect.objectContaining({ pitcherId: "reliever", runsAllowed: 1 }),
    ]);
  });

  it("clears stale responsibility when the half-inning ends", () => {
    const nextHalfSnapshot: Snapshot = {
      ...snapshot,
      inning: 1,
      half: "bottom",
    };
    const halfEndingOut = entryWithMovements({
      id: "half-ending-batter",
      result: "groundOut",
      movements: [movement("half-ending-batter", "batter", "out")],
      outsRecorded: 1,
      outsAfter: 3,
      after: nextHalfSnapshot,
    });
    const pitchingChange: SubstitutionEvent = {
      id: "pitching-change",
      kind: "substitution",
      team: "home",
      inPlayerId: "reliever",
      outPlayerId: "starter",
      role: "pitcher",
    };
    const relieverRun = movement("same-player", "first", "home");

    const stats = getPitcherStats(
      [
        entryWithMovements({
          id: "same-player",
          result: "single",
          movements: [movement("same-player", "batter", "first")],
        }),
        halfEndingOut,
        substitutionEntry(pitchingChange),
        entryWithMovements({
          id: "same-player",
          result: "walk",
          movements: [movement("same-player", "batter", "first")],
        }),
        entryWithMovements({
          id: "next-batter",
          result: "double",
          movements: [relieverRun, movement("next-batter", "batter", "second")],
          scoringMovements: [relieverRun],
        }),
      ],
      "home",
      "starter"
    );

    expect(stats).toEqual([
      expect.objectContaining({ pitcherId: "starter", runsAllowed: 0 }),
      expect.objectContaining({ pitcherId: "reliever", runsAllowed: 1 }),
    ]);
  });
});

describe("getPitcherStats with position changes", () => {
  it("credits a fielder who takes the mound through a position change", () => {
    const positionChange: TimelineEntry = {
      ...entry("unused", "away", "strikeout"),
      event: {
        id: "swap",
        kind: "positionChange",
        team: "home",
        changes: [
          { playerId: "home-short", position: "pitcher" },
          { playerId: "home-starter", position: "short" },
        ],
      },
      team: "home",
      outsAfter: 0,
      outsRecorded: 0,
    };

    const lines = getPitcherStats(
      [
        entry("k1", "away", "strikeout", 1),
        positionChange,
        entry("k2", "away", "strikeout", 1),
        entry("k3", "away", "strikeout", 1),
      ],
      "home",
      "home-starter"
    );

    expect(lines).toMatchObject([
      { pitcherId: "home-starter", role: "starter", outs: 1, strikeouts: 1 },
      { pitcherId: "home-short", role: "reliever", outs: 2, strikeouts: 2 },
    ]);
  });

  it("credits a substitute who enters the game as the pitcher", () => {
    const substitution: TimelineEntry = {
      ...entry("unused", "away", "strikeout"),
      event: {
        id: "sub",
        kind: "substitution",
        team: "home",
        inPlayerId: "home-bench",
        outPlayerId: "home-first",
        role: "fielder",
        position: "pitcher",
      },
      team: "home",
    };

    const lines = getPitcherStats(
      [substitution, entry("k1", "away", "strikeout", 1)],
      "home",
      "home-starter"
    );

    expect(lines[1]).toMatchObject({ pitcherId: "home-bench", outs: 1 });
  });
});
