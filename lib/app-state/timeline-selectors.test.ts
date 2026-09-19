import { describe, expect, it } from "vitest";

import type { Snapshot, TimelineEntry } from "../domain/types";
import {
  getPlayerInningEntries,
  getRejectedEventIssues,
} from "./timeline-selectors";

const snapshot: Snapshot = {
  inning: 1,
  half: "top",
  outs: 0,
  runners: { first: null, second: null, third: null },
  activeLineup: { away: ["player"], home: ["opponent"] },
  activePitcherId: { away: null, home: null },
  fieldingPositions: { away: {}, home: {} },
  currentBatterIndex: { away: 0, home: 0 },
  score: { away: 0, home: 0 },
  gameStatus: "live",
};

function entry(
  id: string,
  event: TimelineEntry["event"],
  overrides: Partial<TimelineEntry> = {}
): TimelineEntry {
  return {
    event,
    index: 0,
    inning: 1,
    half: "top",
    team: "away",
    outsBefore: 0,
    outsAfter: 0,
    outsRecorded: 0,
    runsScored: 0,
    scoringMovements: [],
    applied: true,
    before: snapshot,
    after: snapshot,
    ...overrides,
  };
}

describe("getPlayerInningEntries", () => {
  it("collects plate appearances, running, and substitution entries", () => {
    const timeline = [
      entry("at-bat", {
        id: "at-bat",
        kind: "atBat",
        batterId: "player",
        result: "single",
        movements: [],
      }),
      entry("running", {
        id: "running",
        kind: "baseRunning",
        type: "steal",
        movements: [
          {
            playerId: "player",
            from: "first",
            to: "second",
            isRBI: false,
          },
        ],
      }),
      entry("substitution", {
        id: "substitution",
        kind: "substitution",
        team: "away",
        inPlayerId: "bench",
        outPlayerId: "player",
        role: "pinchHitter",
      }),
      entry(
        "other-inning",
        {
          id: "other-inning",
          kind: "atBat",
          batterId: "player",
          result: "walk",
          movements: [],
        },
        { inning: 2 }
      ),
    ];

    expect(
      getPlayerInningEntries(timeline, "player", "away", 1).map(
        ({ event }) => event.id
      )
    ).toEqual(["at-bat", "running", "substitution"]);
  });
});

describe("getRejectedEventIssues", () => {
  it("returns each rejected event once with its error violations", () => {
    const rejected = entry(
      "rejected",
      {
        id: "rejected",
        kind: "atBat",
        batterId: "player",
        result: "single",
        movements: [],
      },
      { index: 2, applied: false }
    );

    const issues = getRejectedEventIssues(
      [rejected],
      [
        {
          code: "WRONG_BATTER",
          severity: "warning",
          message: "warning",
          eventIndex: 2,
        },
        {
          code: "SOURCE_RUNNER_MISMATCH",
          severity: "error",
          message: "error",
          eventIndex: 2,
        },
      ]
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]?.entry.event.id).toBe("rejected");
    expect(issues[0]?.violations.map((violation) => violation.message)).toEqual(
      ["error"]
    );
  });

  it("collects runner placements and position changes that involve the player", () => {
    const timeline = [
      entry("placement", {
        id: "placement",
        kind: "runnerPlacement",
        runners: { first: null, second: "player", third: null },
      }),
      entry("other-placement", {
        id: "other-placement",
        kind: "runnerPlacement",
        runners: { first: "someone", second: null, third: null },
      }),
      entry("move", {
        id: "move",
        kind: "positionChange",
        team: "away",
        changes: [{ playerId: "player", position: "pitcher" }],
      }),
    ];

    expect(
      getPlayerInningEntries(timeline, "player", "away", 1).map(
        ({ event }) => event.id
      )
    ).toEqual(["placement", "move"]);
  });
});
