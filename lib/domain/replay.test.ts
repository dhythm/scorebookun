import { describe, expect, it } from "vitest";

import { replay } from "./replay";
import type {
  AtBatEvent,
  GameConfig,
  GameEvent,
  GameNoteEvent,
  Player,
  RunnerMovement,
  SubstitutionEvent,
} from "./types";

function players(side: string, count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${side}-${index + 1}`,
    name: `${side} player ${index + 1}`,
    order: index + 1,
  }));
}

function config(
  regulationInnings = 7,
  awayPlayerCount = 1,
  homePlayerCount = 1
): GameConfig {
  return {
    regulationInnings,
    teams: {
      away: { name: "Away", players: players("away", awayPlayerCount) },
      home: { name: "Home", players: players("home", homePlayerCount) },
    },
  };
}

function substitution(
  id: string,
  team: SubstitutionEvent["team"],
  inPlayerId: string,
  outPlayerId: string,
  role: SubstitutionEvent["role"]
): SubstitutionEvent {
  return {
    id,
    kind: "substitution",
    team,
    inPlayerId,
    outPlayerId,
    role,
  };
}

function atBat(
  id: string,
  batterId: string,
  movements: RunnerMovement[],
  result: AtBatEvent["result"] = "groundOut"
): AtBatEvent {
  return {
    id,
    kind: "atBat",
    batterId,
    result,
    movements,
  };
}

function out(id: string, batterId: string): AtBatEvent {
  return atBat(id, batterId, [
    { playerId: batterId, from: "batter", to: "out", isRBI: false },
  ]);
}

function run(id: string, batterId: string): AtBatEvent {
  return atBat(
    id,
    batterId,
    [{ playerId: batterId, from: "batter", to: "home", isRBI: true }],
    "homerun"
  );
}

function threeOuts(prefix: string, batterId: string): GameEvent[] {
  return [1, 2, 3].map((number) => out(`${prefix}-${number}`, batterId));
}

describe("replay", () => {
  it("starts an empty game at the top of the first inning", () => {
    const result = replay([], config());

    expect(result.snapshot).toEqual({
      inning: 1,
      half: "top",
      outs: 0,
      runners: { first: null, second: null, third: null },
      activeLineup: { away: ["away-1"], home: ["home-1"] },
      activePitcherId: { away: null, home: null },
      currentBatterIndex: { away: 0, home: 0 },
      score: { away: 0, home: 0 },
      gameStatus: "live",
    });
    expect(result.timeline).toEqual([]);
    expect(result.violations).toEqual([]);
  });

  it("records a game note in the timeline without changing game state", () => {
    const event: GameNoteEvent = {
      id: "rain-delay",
      kind: "note",
      text: "雨天のため10分間中断",
    };

    const result = replay([event], config());

    expect(result.violations).toEqual([]);
    expect(result.timeline[0]).toMatchObject({
      event,
      inning: 1,
      half: "top",
      team: "away",
      outsBefore: 0,
      outsAfter: 0,
      outsRecorded: 0,
      runsScored: 0,
      scoringMovements: [],
      applied: true,
    });
    expect(result.timeline[0].after).toEqual(result.timeline[0].before);
    expect(result.snapshot).toEqual(replay([], config()).snapshot);
  });

  it.each([
    ["blank", "   ", "EMPTY_GAME_NOTE"],
    ["over 120 characters", "あ".repeat(121), "GAME_NOTE_TOO_LONG"],
  ])("rejects a %s game note", (_label, text, code) => {
    const result = replay([{ id: "note", kind: "note", text }], config());

    expect(result.timeline[0]).toMatchObject({ applied: false });
    expect(result.timeline[0].after).toEqual(result.timeline[0].before);
    expect(result.violations).toContainEqual(
      expect.objectContaining({ code, eventId: "note", severity: "error" })
    );
  });

  it("accepts a game note containing exactly 120 characters", () => {
    const result = replay(
      [{ id: "note", kind: "note", text: "あ".repeat(120) }],
      config()
    );

    expect(result.timeline[0]).toMatchObject({ applied: true });
    expect(result.violations).toEqual([]);
  });

  it("clears the bases and changes halves after three outs", () => {
    const events = [
      atBat("on-base", "away-1", [
        {
          playerId: "away-1",
          from: "batter",
          to: "first",
          isRBI: false,
        },
      ]),
      ...threeOuts("out", "away-1"),
    ];

    const result = replay(events, config());

    expect(result.snapshot).toMatchObject({
      inning: 1,
      half: "bottom",
      outs: 0,
      runners: { first: null, second: null, third: null },
    });
    expect(result.timeline.at(-1)).toMatchObject({
      inning: 1,
      half: "top",
      outsBefore: 2,
      outsRecorded: 1,
    });
  });

  it("rotates each team's batting order independently", () => {
    const events = [
      out("away-out-1", "away-1"),
      out("away-out-2", "away-2"),
      out("away-out-3", "away-1"),
      out("home-out-1", "home-1"),
    ];

    const result = replay(events, config(7, 2, 2));

    expect(result.snapshot.currentBatterIndex).toEqual({ away: 1, home: 1 });
    expect(result.timeline.map(({ team }) => team)).toEqual([
      "away",
      "away",
      "away",
      "home",
    ]);
    expect(result.violations).toEqual([]);
  });

  it("derives runs and effective scoring movements from movements", () => {
    const result = replay([run("home-run", "away-1")], config());

    expect(result.snapshot.score).toEqual({ away: 1, home: 0 });
    expect(result.timeline[0]).toMatchObject({
      runsScored: 1,
      outsRecorded: 0,
      scoringMovements: [
        {
          playerId: "away-1",
          from: "batter",
          to: "home",
          isRBI: true,
        },
      ],
    });
  });

  it("does not count a run or RBI movement after the third out", () => {
    const gameConfig = config(7, 5, 1);
    const events: GameEvent[] = [
      atBat("runner-third", "away-1", [
        {
          playerId: "away-1",
          from: "batter",
          to: "third",
          isRBI: false,
        },
      ]),
      out("first-out", "away-2"),
      out("second-out", "away-3"),
      atBat("third-out-and-run", "away-4", [
        {
          playerId: "away-4",
          from: "batter",
          to: "out",
          isRBI: false,
        },
        {
          playerId: "away-1",
          from: "third",
          to: "home",
          isRBI: true,
        },
      ]),
    ];

    const result = replay(events, gameConfig);
    const lastEntry = result.timeline.at(-1);

    expect(result.snapshot.score.away).toBe(0);
    expect(lastEntry?.runsScored).toBe(0);
    expect(lastEntry?.scoringMovements).toEqual([]);
  });

  it("does not count a run when the batter makes the third out, regardless of movement order", () => {
    const events: GameEvent[] = [
      atBat("runner-third", "away-1", [
        {
          playerId: "away-1",
          from: "batter",
          to: "third",
          isRBI: false,
        },
      ]),
      out("first-out", "away-2"),
      out("second-out", "away-3"),
      atBat("third-out-and-run", "away-4", [
        {
          playerId: "away-1",
          from: "third",
          to: "home",
          isRBI: true,
        },
        {
          playerId: "away-4",
          from: "batter",
          to: "out",
          isRBI: false,
        },
      ]),
    ];

    const result = replay(events, config(7, 5, 1));

    expect(result.snapshot.score.away).toBe(0);
    expect(result.timeline.at(-1)?.scoringMovements).toEqual([]);
  });

  it("counts a preceding run when the batter is put out after reaching first on a hit", () => {
    const events: GameEvent[] = [
      atBat(
        "runner-second",
        "away-1",
        [{ playerId: "away-1", from: "batter", to: "second", isRBI: false }],
        "double"
      ),
      out("first-out", "away-2"),
      out("second-out", "away-3"),
      atBat(
        "single-then-thrown-out",
        "away-4",
        [
          { playerId: "away-1", from: "second", to: "home", isRBI: true },
          { playerId: "away-4", from: "batter", to: "out", isRBI: false },
        ],
        "single"
      ),
    ];

    const result = replay(events, config(7, 5, 1));

    expect(result.snapshot.score.away).toBe(1);
    expect(result.snapshot.half).toBe("bottom");
  });

  it("counts a preceding run when the batter-runner is tagged out after reaching first on an error", () => {
    const events: GameEvent[] = [
      atBat(
        "runner-third",
        "away-1",
        [{ playerId: "away-1", from: "batter", to: "third", isRBI: false }],
        "triple"
      ),
      out("first-out", "away-2"),
      out("second-out", "away-3"),
      atBat(
        "error-then-thrown-out",
        "away-4",
        [
          { playerId: "away-1", from: "third", to: "home", isRBI: false },
          {
            playerId: "away-4",
            from: "batter",
            to: "out",
            isRBI: false,
            outType: "tag",
          },
        ],
        "error"
      ),
    ];

    expect(replay(events, config(7, 5, 1)).snapshot.score.away).toBe(1);
  });

  it("does not count a run scored after the batter-runner's tag third out", () => {
    const events: GameEvent[] = [
      atBat(
        "runner-second",
        "away-1",
        [{ playerId: "away-1", from: "batter", to: "second", isRBI: false }],
        "double"
      ),
      out("first-out", "away-2"),
      out("second-out", "away-3"),
      atBat(
        "thrown-out-before-run",
        "away-4",
        [
          { playerId: "away-4", from: "batter", to: "out", isRBI: false },
          { playerId: "away-1", from: "second", to: "home", isRBI: true },
        ],
        "single"
      ),
    ];

    expect(replay(events, config(7, 5, 1)).snapshot.score.away).toBe(0);
  });

  it("records an arbitrary multiple-out play from the entered movements", () => {
    const doubleOutMovements: RunnerMovement[] = [
      {
        playerId: "away-1",
        from: "first",
        to: "out",
        isRBI: false,
      },
      {
        playerId: "away-2",
        from: "batter",
        to: "out",
        isRBI: false,
      },
    ];
    const events: GameEvent[] = [
      atBat(
        "single",
        "away-1",
        [
          {
            playerId: "away-1",
            from: "batter",
            to: "first",
            isRBI: false,
          },
        ],
        "single"
      ),
      atBat("double-out", "away-2", doubleOutMovements, "otherOut"),
    ];

    const result = replay(events, config(7, 2, 1));

    expect(result.timeline[1].outsRecorded).toBe(2);
    expect(result.timeline[1].event).toMatchObject({
      kind: "atBat",
      movements: doubleOutMovements,
    });
    expect(result.snapshot.outs).toBe(2);
  });

  it("does not count a run when a force play records the third out", () => {
    const events: GameEvent[] = [
      atBat("runner-third", "away-1", [
        {
          playerId: "away-1",
          from: "batter",
          to: "third",
          isRBI: false,
        },
      ]),
      atBat("runner-first", "away-2", [
        {
          playerId: "away-2",
          from: "batter",
          to: "first",
          isRBI: false,
        },
      ]),
      out("first-out", "away-3"),
      out("second-out", "away-4"),
      atBat("force-third-out", "away-5", [
        {
          playerId: "away-1",
          from: "third",
          to: "home",
          isRBI: true,
        },
        {
          playerId: "away-2",
          from: "first",
          to: "out",
          isRBI: false,
          outType: "force",
        },
        {
          playerId: "away-5",
          from: "batter",
          to: "first",
          isRBI: false,
        },
      ]),
    ];

    const result = replay(events, config(7, 5, 1));

    expect(result.snapshot.score.away).toBe(0);
    expect(result.timeline.at(-1)?.scoringMovements).toEqual([]);
  });

  it("rejects a play that records more outs than remain in the half-inning", () => {
    const events: GameEvent[] = [
      atBat(
        "runner-first",
        "away-1",
        [
          {
            playerId: "away-1",
            from: "batter",
            to: "first",
            isRBI: false,
          },
        ],
        "single"
      ),
      out("first-out", "away-2"),
      out("second-out", "away-3"),
      atBat("too-many-outs", "away-4", [
        {
          playerId: "away-4",
          from: "batter",
          to: "out",
          isRBI: false,
        },
        {
          playerId: "away-1",
          from: "first",
          to: "out",
          isRBI: false,
        },
      ]),
    ];

    const result = replay(events, config(7, 4, 1));

    expect(result.timeline.at(-1)?.applied).toBe(false);
    expect(result.snapshot).toMatchObject({ half: "top", outs: 2 });
    expect(
      result.violations.filter((item) => item.eventId === "too-many-outs")
    ).toHaveLength(1);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "OUTS_EXCEED_HALF_INNING",
        eventId: "too-many-outs",
      })
    );
  });

  it("replays a multi-runner base-running score", () => {
    const events: GameEvent[] = [
      atBat("runner-third", "away-1", [
        {
          playerId: "away-1",
          from: "batter",
          to: "third",
          isRBI: false,
        },
      ]),
      atBat("runner-first", "away-2", [
        {
          playerId: "away-2",
          from: "batter",
          to: "first",
          isRBI: false,
        },
      ]),
      {
        id: "double-steal",
        kind: "baseRunning",
        type: "steal",
        movements: [
          {
            playerId: "away-1",
            from: "third",
            to: "home",
            isRBI: true,
          },
          {
            playerId: "away-2",
            from: "first",
            to: "second",
            isRBI: false,
          },
        ],
        rbiCreditBatterId: "away-2",
      },
    ];

    const result = replay(events, config(7, 2, 1));

    expect(result.timeline.at(-1)).toMatchObject({
      applied: true,
      runsScored: 1,
      scoringMovements: [
        expect.objectContaining({ playerId: "away-1", isRBI: true }),
      ],
    });
    expect(result.snapshot).toMatchObject({
      score: { away: 1, home: 0 },
      runners: { first: null, second: "away-2", third: null },
    });
  });

  it("re-derives every later inning placement when an earlier event is removed", () => {
    const events = [
      ...threeOuts("top", "away-1"),
      ...threeOuts("bottom", "home-1"),
      out("second-inning", "away-1"),
    ];

    const original = replay(events, config());
    const afterDeletion = replay(
      events.filter((event) => event.id !== "top-1"),
      config()
    );

    expect(original.timeline.at(-1)).toMatchObject({
      inning: 2,
      half: "top",
    });
    expect(afterDeletion.timeline.at(-1)).toMatchObject({
      inning: 1,
      half: "top",
    });
  });

  it("rejects a destination collision atomically", () => {
    const firstEvent = atBat("occupy-first", "away-1", [
      {
        playerId: "away-1",
        from: "batter",
        to: "first",
        isRBI: false,
      },
    ]);
    const collision = atBat("collision", "away-2", [
      {
        playerId: "away-2",
        from: "batter",
        to: "first",
        isRBI: false,
      },
    ]);

    const result = replay([firstEvent, collision], config(7, 2, 1));

    expect(result.snapshot.runners).toEqual({
      first: "away-1",
      second: null,
      third: null,
    });
    expect(result.snapshot.currentBatterIndex.away).toBe(1);
    expect(result.timeline[1].applied).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        eventId: "collision",
        code: "DESTINATION_OCCUPIED",
        severity: "error",
      })
    );
  });

  it("preserves explicitly entered runner destinations during replay", () => {
    const events: GameEvent[] = [
      atBat(
        "runner-on-first",
        "away-1",
        [
          {
            playerId: "away-1",
            from: "batter",
            to: "first",
            isRBI: false,
          },
        ],
        "walk"
      ),
      atBat("manual-advance", "away-2", [
        {
          playerId: "away-1",
          from: "first",
          to: "third",
          isRBI: false,
        },
        {
          playerId: "away-2",
          from: "batter",
          to: "first",
          isRBI: false,
        },
      ]),
    ];

    const result = replay(events, config(7, 2, 1));

    expect(result.snapshot.runners).toEqual({
      first: "away-2",
      second: null,
      third: "away-1",
    });
  });

  it("skips the regulation bottom half when the home team already leads", () => {
    const events: GameEvent[] = [
      ...threeOuts("top-1", "away-1"),
      run("home-score", "home-1"),
      ...threeOuts("bottom-1", "home-1"),
      ...threeOuts("top-2", "away-1"),
    ];

    const result = replay(events, config(2));

    expect(result.snapshot).toMatchObject({
      inning: 2,
      half: "bottom",
      score: { away: 0, home: 1 },
      gameStatus: "finished",
      gameEndReason: "homeAheadAfterTop",
    });
  });

  it("ends immediately on a regulation-inning walk-off", () => {
    const events = [...threeOuts("top", "away-1"), run("walk-off", "home-1")];

    const result = replay(events, config(1));

    expect(result.snapshot).toMatchObject({
      inning: 1,
      half: "bottom",
      score: { away: 0, home: 1 },
      gameStatus: "finished",
      gameEndReason: "walkOff",
    });
  });

  it("ends with an away win after the regulation bottom half", () => {
    const events = [
      run("away-score", "away-1"),
      ...threeOuts("top", "away-1"),
      ...threeOuts("bottom", "home-1"),
    ];

    const result = replay(events, config(1));

    expect(result.snapshot).toMatchObject({
      score: { away: 1, home: 0 },
      gameStatus: "finished",
      gameEndReason: "completedHalf",
    });
  });

  it("continues tied games into extras and ends after an extra inning", () => {
    const regulationTie = [
      ...threeOuts("regulation-top", "away-1"),
      ...threeOuts("regulation-bottom", "home-1"),
    ];
    const tiedResult = replay(regulationTie, config(1));

    expect(tiedResult.snapshot).toMatchObject({
      inning: 2,
      half: "top",
      gameStatus: "live",
    });

    const decidedResult = replay(
      [
        ...regulationTie,
        run("extra-away-score", "away-1"),
        ...threeOuts("extra-top", "away-1"),
        ...threeOuts("extra-bottom", "home-1"),
      ],
      config(1)
    );

    expect(decidedResult.snapshot).toMatchObject({
      inning: 3,
      half: "top",
      score: { away: 1, home: 0 },
      gameStatus: "finished",
      gameEndReason: "completedHalf",
    });
  });

  it("replaces the active batting-order slot for a pinch hitter", () => {
    const gameConfig = config(7, 2, 1);
    gameConfig.teams.away.benchPlayers = [
      { id: "away-bench", name: "Pinch hitter", order: 0 },
    ];
    const events: GameEvent[] = [
      substitution(
        "pinch-hitter",
        "away",
        "away-bench",
        "away-1",
        "pinchHitter"
      ),
      out("pinch-hit-result", "away-bench"),
    ];

    const result = replay(events, gameConfig);

    expect(result.snapshot.activeLineup.away).toEqual(["away-bench", "away-2"]);
    expect(result.snapshot.currentBatterIndex.away).toBe(1);
    expect(result.timeline.every((entry) => entry.applied)).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("replaces both the active batting-order slot and runner for a pinch runner", () => {
    const gameConfig = config(7, 2, 1);
    gameConfig.teams.away.benchPlayers = [
      { id: "away-bench", name: "Pinch runner", order: 0 },
    ];
    const events: GameEvent[] = [
      atBat(
        "single",
        "away-1",
        [
          {
            playerId: "away-1",
            from: "batter",
            to: "first",
            isRBI: false,
          },
        ],
        "single"
      ),
      substitution(
        "pinch-runner",
        "away",
        "away-bench",
        "away-1",
        "pinchRunner"
      ),
    ];

    const result = replay(events, gameConfig);

    expect(result.snapshot.activeLineup.away).toEqual(["away-bench", "away-2"]);
    expect(result.snapshot.runners.first).toBe("away-bench");
    expect(result.timeline[1]).toMatchObject({
      team: "away",
      outsRecorded: 0,
      runsScored: 0,
      applied: true,
    });
  });

  it("rejects a pinch runner when the outgoing player is not on base", () => {
    const gameConfig = config();
    gameConfig.teams.away.benchPlayers = [
      { id: "away-bench", name: "Pinch runner", order: 0 },
    ];

    const result = replay(
      [
        substitution(
          "invalid-pinch-runner",
          "away",
          "away-bench",
          "away-1",
          "pinchRunner"
        ),
      ],
      gameConfig
    );

    expect(result.timeline[0].applied).toBe(false);
    expect(result.snapshot.activeLineup.away).toEqual(["away-1"]);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "SUBSTITUTION_RUNNER_NOT_FOUND",
        eventId: "invalid-pinch-runner",
      })
    );
  });

  it("keeps defensive substitutions in the timeline and updates their batting slot", () => {
    const gameConfig = config();
    gameConfig.teams.home.benchPlayers = [
      { id: "home-reliever", name: "Reliever", order: 0 },
    ];

    const result = replay(
      [
        substitution(
          "pitching-change",
          "home",
          "home-reliever",
          "home-1",
          "pitcher"
        ),
      ],
      gameConfig
    );

    expect(result.timeline[0]).toMatchObject({
      inning: 1,
      half: "top",
      team: "home",
      applied: true,
    });
    expect(result.snapshot.activeLineup.home).toEqual(["home-reliever"]);
    expect(result.snapshot.activePitcherId.home).toBe("home-reliever");
  });

  it("changes a starting pitcher outside the batting order without replacing a DH slot", () => {
    const gameConfig = config();
    gameConfig.teams.home.players[0].position = "dh";
    gameConfig.teams.home.benchPlayers = [
      {
        id: "home-starter",
        name: "Starting pitcher",
        order: 0,
        position: "pitcher",
      },
      {
        id: "home-reliever",
        name: "Relief pitcher",
        order: 0,
        position: "pitcher",
      },
    ];
    gameConfig.teams.home.startingPitcherId = "home-starter";

    const result = replay(
      [
        substitution(
          "dh-pitching-change",
          "home",
          "home-reliever",
          "home-starter",
          "pitcher"
        ),
      ],
      gameConfig
    );

    expect(result.timeline[0].applied).toBe(true);
    expect(result.snapshot.activePitcherId.home).toBe("home-reliever");
    expect(result.snapshot.activeLineup.home).toEqual(["home-1"]);
    expect(result.violations).toEqual([]);
  });

  it("ends immediately when an end-game control event is replayed", () => {
    const events: GameEvent[] = [
      {
        id: "called-game",
        kind: "gameControl",
        action: "endGame",
        reason: "降雨コールド",
      },
      out("ignored-after-end", "away-1"),
    ];

    const result = replay(events, config());

    expect(result.snapshot).toMatchObject({
      gameStatus: "finished",
      gameEndReason: "manual",
      gameEndReasonDetail: "降雨コールド",
    });
    expect(result.timeline[0]).toMatchObject({
      applied: true,
      runsScored: 0,
      outsRecorded: 0,
    });
    expect(result.timeline[1].applied).toBe(false);
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        code: "GAME_ALREADY_FINISHED",
        eventId: "ignored-after-end",
      })
    );
  });
});
