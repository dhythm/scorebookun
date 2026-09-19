import type {
  Base,
  FieldingPosition,
  GameConfig,
  GameEvent,
  PositionChangeEvent,
  ReplayResult,
  RunnerPlacementEvent,
  Snapshot,
  SubstitutionEvent,
  TeamSide,
  TimelineEntry,
  Violation,
} from "./types";
import { evaluateMovementOutcome } from "./runner-advance";

const EMPTY_RUNNERS = {
  first: null,
  second: null,
  third: null,
} as const;

const BASE_NUMBER: Record<Base, number> = {
  first: 1,
  second: 2,
  third: 3,
};

function initialSnapshot(config: GameConfig): Snapshot {
  const initialPitcherId = (team: TeamSide): string | null =>
    config.teams[team].startingPitcherId ??
    config.teams[team].players.find((player) => player.position === "pitcher")
      ?.id ??
    null;

  const initialPositions = (
    team: TeamSide
  ): Record<string, FieldingPosition> => {
    const positions: Record<string, FieldingPosition> = {};
    for (const player of config.teams[team].players) {
      if (player.position) positions[player.id] = player.position;
    }
    const pitcherId = initialPitcherId(team);
    if (pitcherId) positions[pitcherId] = "pitcher";
    return positions;
  };

  return {
    inning: 1,
    half: "top",
    outs: 0,
    runners: { ...EMPTY_RUNNERS },
    activeLineup: {
      away: config.teams.away.players.map((player) => player.id),
      home: config.teams.home.players.map((player) => player.id),
    },
    activePitcherId: {
      away: initialPitcherId("away"),
      home: initialPitcherId("home"),
    },
    fieldingPositions: {
      away: initialPositions("away"),
      home: initialPositions("home"),
    },
    currentBatterIndex: { away: 0, home: 0 },
    score: { away: 0, home: 0 },
    gameStatus: "live",
  };
}

function copySnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    runners: { ...snapshot.runners },
    activeLineup: {
      away: [...snapshot.activeLineup.away],
      home: [...snapshot.activeLineup.home],
    },
    activePitcherId: { ...snapshot.activePitcherId },
    fieldingPositions: {
      away: { ...snapshot.fieldingPositions.away },
      home: { ...snapshot.fieldingPositions.home },
    },
    currentBatterIndex: { ...snapshot.currentBatterIndex },
    score: { ...snapshot.score },
  };
}

function offense(snapshot: Snapshot): TeamSide {
  return snapshot.half === "top" ? "away" : "home";
}

function violation(
  event: GameEvent,
  eventIndex: number,
  code: Violation["code"],
  severity: Violation["severity"],
  message: string
): Violation {
  return { code, severity, message, eventId: event.id, eventIndex };
}

function validateConfig(config: GameConfig): Violation[] {
  const violations: Violation[] = [];

  if (
    !Number.isInteger(config.regulationInnings) ||
    config.regulationInnings < 1
  ) {
    violations.push({
      code: "INVALID_REGULATION_INNINGS",
      severity: "error",
      message: "regulationInnings must be a positive integer",
    });
  }

  const seenPlayerIds = new Set<string>();
  for (const side of ["away", "home"] as const) {
    const lineup = config.teams[side].players;
    const roster = [...lineup, ...(config.teams[side].benchPlayers ?? [])];
    if (lineup.length === 0) {
      violations.push({
        code: "EMPTY_LINEUP",
        severity: "error",
        message: `${side} lineup must contain at least one player`,
      });
    }
    for (const player of roster) {
      if (seenPlayerIds.has(player.id)) {
        violations.push({
          code: "DUPLICATE_PLAYER_ID",
          severity: "error",
          message: `player id ${player.id} is not unique`,
        });
      }
      seenPlayerIds.add(player.id);
    }
  }

  return violations;
}

function validateEvent(
  event: GameEvent,
  eventIndex: number,
  snapshot: Snapshot,
  config: GameConfig,
  allPlayerIds: ReadonlySet<string>
): Violation[] {
  const violations: Violation[] = [];
  const team = offense(snapshot);
  const activeLineup = snapshot.activeLineup[team];
  const offensivePlayerIds = new Set(activeLineup);

  if (event.kind === "atBat") {
    if (!allPlayerIds.has(event.batterId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "UNKNOWN_PLAYER",
          "error",
          `unknown batter ${event.batterId}`
        )
      );
    } else if (!offensivePlayerIds.has(event.batterId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "PLAYER_NOT_ON_OFFENSE",
          "error",
          `batter ${event.batterId} is not on the offensive team`
        )
      );
    }

    const expectedBatterId = activeLineup[snapshot.currentBatterIndex[team]];
    if (expectedBatterId && event.batterId !== expectedBatterId) {
      violations.push(
        violation(
          event,
          eventIndex,
          "WRONG_BATTER",
          "warning",
          `expected batter ${expectedBatterId}, received ${event.batterId}`
        )
      );
    }
  } else if (event.kind === "baseRunning" && event.rbiCreditBatterId) {
    if (!allPlayerIds.has(event.rbiCreditBatterId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "UNKNOWN_PLAYER",
          "error",
          `unknown RBI credit batter ${event.rbiCreditBatterId}`
        )
      );
    } else if (!offensivePlayerIds.has(event.rbiCreditBatterId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "PLAYER_NOT_ON_OFFENSE",
          "error",
          `RBI credit batter ${event.rbiCreditBatterId} is not on the offensive team`
        )
      );
    }
  }

  if (event.kind === "substitution") {
    return [
      ...violations,
      ...validateSubstitution(event, eventIndex, snapshot, config),
    ];
  }
  if (event.kind === "note") {
    if (event.text.trim().length === 0) {
      violations.push(
        violation(
          event,
          eventIndex,
          "EMPTY_GAME_NOTE",
          "error",
          "game note must not be blank"
        )
      );
    } else if (Array.from(event.text).length > 120) {
      violations.push(
        violation(
          event,
          eventIndex,
          "GAME_NOTE_TOO_LONG",
          "error",
          "game note must not exceed 120 characters"
        )
      );
    }
    return violations;
  }
  if (event.kind === "gameControl") return violations;
  if (event.kind === "positionChange") {
    return [
      ...violations,
      ...validatePositionChange(event, eventIndex, snapshot),
    ];
  }
  if (event.kind === "runnerPlacement") {
    return [
      ...violations,
      ...validateRunnerPlacement(
        event,
        eventIndex,
        offensivePlayerIds,
        allPlayerIds
      ),
    ];
  }

  const outsInPlay = event.movements.filter(
    (movement) => movement.to === "out"
  ).length;
  if (snapshot.outs + outsInPlay > 3) {
    violations.push(
      violation(
        event,
        eventIndex,
        "OUTS_EXCEED_HALF_INNING",
        "error",
        `play records ${outsInPlay} outs with ${snapshot.outs} already recorded`
      )
    );
  }

  const seenSources = new Set<string>();
  const seenPlayers = new Set<string>();
  const seenDestinations = new Set<Base>();
  const vacatedBases = new Set<Base>();

  for (const movement of event.movements) {
    if (movement.from !== "batter") vacatedBases.add(movement.from);
  }

  for (const movement of event.movements) {
    if (seenSources.has(movement.from)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "DUPLICATE_MOVEMENT_SOURCE",
          "error",
          `movement source ${movement.from} appears more than once`
        )
      );
    }
    seenSources.add(movement.from);

    if (seenPlayers.has(movement.playerId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "DUPLICATE_RUNNER_MOVEMENT",
          "error",
          `runner ${movement.playerId} appears more than once`
        )
      );
    }
    seenPlayers.add(movement.playerId);

    if (!allPlayerIds.has(movement.playerId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "UNKNOWN_PLAYER",
          "error",
          `unknown runner ${movement.playerId}`
        )
      );
    } else if (!offensivePlayerIds.has(movement.playerId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "PLAYER_NOT_ON_OFFENSE",
          "error",
          `runner ${movement.playerId} is not on the offensive team`
        )
      );
    }

    if (movement.from === "batter") {
      if (event.kind !== "atBat" || movement.playerId !== event.batterId) {
        violations.push(
          violation(
            event,
            eventIndex,
            "BATTER_SOURCE_NOT_ALLOWED",
            "error",
            "batter movement must belong to the at-bat batter"
          )
        );
      }
    } else if (snapshot.runners[movement.from] !== movement.playerId) {
      violations.push(
        violation(
          event,
          eventIndex,
          "SOURCE_RUNNER_MISMATCH",
          "error",
          `${movement.playerId} does not occupy ${movement.from}`
        )
      );
    }

    if (movement.to !== "home" && movement.to !== "out") {
      if (seenDestinations.has(movement.to)) {
        violations.push(
          violation(
            event,
            eventIndex,
            "DUPLICATE_DESTINATION",
            "error",
            `more than one runner would occupy ${movement.to}`
          )
        );
      }
      seenDestinations.add(movement.to);

      const occupant = snapshot.runners[movement.to];
      if (occupant !== null && !vacatedBases.has(movement.to)) {
        violations.push(
          violation(
            event,
            eventIndex,
            "DESTINATION_OCCUPIED",
            "error",
            `${movement.to} is occupied by ${occupant}`
          )
        );
      }

      if (
        movement.from !== "batter" &&
        BASE_NUMBER[movement.to] < BASE_NUMBER[movement.from]
      ) {
        violations.push(
          violation(
            event,
            eventIndex,
            "BACKWARD_MOVEMENT",
            "error",
            `runner cannot move backward from ${movement.from} to ${movement.to}`
          )
        );
      }
    }

    if (movement.isRBI && movement.to !== "home") {
      violations.push(
        violation(
          event,
          eventIndex,
          "INVALID_RBI",
          "error",
          "only a scoring movement can be credited with an RBI"
        )
      );
    }
  }

  return violations;
}

function validateSubstitution(
  event: SubstitutionEvent,
  eventIndex: number,
  snapshot: Snapshot,
  config: GameConfig
): Violation[] {
  const violations: Violation[] = [];
  const rosterIds = new Set(
    [
      ...config.teams[event.team].players,
      ...(config.teams[event.team].benchPlayers ?? []),
    ].map((player) => player.id)
  );
  const activeLineup = snapshot.activeLineup[event.team];
  const activePitcherId = snapshot.activePitcherId[event.team];

  if (!rosterIds.has(event.inPlayerId) || !rosterIds.has(event.outPlayerId)) {
    violations.push(
      violation(
        event,
        eventIndex,
        "SUBSTITUTION_PLAYER_NOT_ON_TEAM",
        "error",
        "both substitution players must belong to the selected team"
      )
    );
  }
  const outgoingPlayerIsActive =
    event.role === "pitcher" && activePitcherId !== null
      ? event.outPlayerId === activePitcherId
      : activeLineup.includes(event.outPlayerId);
  if (!outgoingPlayerIsActive) {
    violations.push(
      violation(
        event,
        eventIndex,
        "SUBSTITUTION_OUT_PLAYER_NOT_ACTIVE",
        "error",
        `outgoing player ${event.outPlayerId} is not active`
      )
    );
  }
  if (activeLineup.includes(event.inPlayerId)) {
    violations.push(
      violation(
        event,
        eventIndex,
        "SUBSTITUTION_IN_PLAYER_ALREADY_ACTIVE",
        "error",
        `incoming player ${event.inPlayerId} is already active`
      )
    );
  }
  if (
    event.role === "pinchRunner" &&
    !Object.values(snapshot.runners).includes(event.outPlayerId)
  ) {
    violations.push(
      violation(
        event,
        eventIndex,
        "SUBSTITUTION_RUNNER_NOT_FOUND",
        "error",
        `outgoing pinch runner ${event.outPlayerId} is not on base`
      )
    );
  }

  return violations;
}

function validatePositionChange(
  event: PositionChangeEvent,
  eventIndex: number,
  snapshot: Snapshot
): Violation[] {
  const violations: Violation[] = [];
  if (event.changes.length === 0) {
    violations.push(
      violation(
        event,
        eventIndex,
        "EMPTY_POSITION_CHANGE",
        "error",
        "position change must move at least one player"
      )
    );
  }
  const seenPlayerIds = new Set<string>();
  for (const change of event.changes) {
    const isActive =
      snapshot.activeLineup[event.team].includes(change.playerId) ||
      snapshot.activePitcherId[event.team] === change.playerId;
    if (!isActive) {
      violations.push(
        violation(
          event,
          eventIndex,
          "POSITION_CHANGE_PLAYER_NOT_ACTIVE",
          "error",
          `player ${change.playerId} is not in the game`
        )
      );
    }
    if (seenPlayerIds.has(change.playerId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "DUPLICATE_RUNNER_MOVEMENT",
          "error",
          `player ${change.playerId} appears more than once`
        )
      );
    }
    seenPlayerIds.add(change.playerId);
  }
  return violations;
}

function validateRunnerPlacement(
  event: RunnerPlacementEvent,
  eventIndex: number,
  offensivePlayerIds: ReadonlySet<string>,
  allPlayerIds: ReadonlySet<string>
): Violation[] {
  const violations: Violation[] = [];
  const seenPlayerIds = new Set<string>();
  for (const base of ["first", "second", "third"] as const) {
    const playerId = event.runners[base];
    if (playerId === null) continue;
    if (!allPlayerIds.has(playerId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "UNKNOWN_PLAYER",
          "error",
          `unknown runner ${playerId}`
        )
      );
    } else if (!offensivePlayerIds.has(playerId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "PLAYER_NOT_ON_OFFENSE",
          "error",
          `runner ${playerId} is not on the offensive team`
        )
      );
    }
    if (seenPlayerIds.has(playerId)) {
      violations.push(
        violation(
          event,
          eventIndex,
          "DUPLICATE_RUNNER_MOVEMENT",
          "error",
          `runner ${playerId} appears more than once`
        )
      );
    }
    seenPlayerIds.add(playerId);
  }
  return violations;
}

function eventTeam(event: GameEvent, snapshot: Snapshot): TeamSide {
  return event.kind === "substitution" || event.kind === "positionChange"
    ? event.team
    : offense(snapshot);
}

/** Timeline entry for an applied event that records no outs or runs. */
function stateChangeEntry(
  event: GameEvent,
  index: number,
  team: TeamSide,
  before: Snapshot,
  after: Snapshot
): TimelineEntry {
  return {
    event,
    index,
    inning: before.inning,
    half: before.half,
    team,
    outsBefore: before.outs,
    outsAfter: before.outs,
    outsRecorded: 0,
    runsScored: 0,
    scoringMovements: [],
    applied: true,
    before,
    after,
  };
}

function rejectedEntry(
  event: GameEvent,
  index: number,
  before: Snapshot
): TimelineEntry {
  return {
    event,
    index,
    inning: before.inning,
    half: before.half,
    team: eventTeam(event, before),
    outsBefore: before.outs,
    outsAfter: before.outs,
    outsRecorded: 0,
    runsScored: 0,
    scoringMovements: [],
    applied: false,
    before,
    after: copySnapshot(before),
  };
}

function finishIfNeeded(
  snapshot: Snapshot,
  config: GameConfig,
  completedHalf: "top" | "bottom" | null
): void {
  if (
    snapshot.inning >= config.regulationInnings &&
    snapshot.half === "bottom" &&
    completedHalf === null &&
    snapshot.score.home > snapshot.score.away
  ) {
    snapshot.gameStatus = "finished";
    snapshot.gameEndReason = "walkOff";
    return;
  }

  if (
    completedHalf === "top" &&
    snapshot.inning >= config.regulationInnings &&
    snapshot.score.home > snapshot.score.away
  ) {
    snapshot.gameStatus = "finished";
    snapshot.gameEndReason = "homeAheadAfterTop";
    return;
  }

  if (
    completedHalf === "bottom" &&
    snapshot.inning > config.regulationInnings &&
    snapshot.score.home !== snapshot.score.away
  ) {
    snapshot.gameStatus = "finished";
    snapshot.gameEndReason = "completedHalf";
  }
}

export function replay(
  events: readonly GameEvent[],
  config: GameConfig
): ReplayResult {
  const snapshot = initialSnapshot(config);
  const timeline: TimelineEntry[] = [];
  const violations = validateConfig(config);
  const seenEventIds = new Set<string>();
  const allPlayerIds = new Set(
    [
      ...config.teams.away.players,
      ...(config.teams.away.benchPlayers ?? []),
      ...config.teams.home.players,
      ...(config.teams.home.benchPlayers ?? []),
    ].map((player) => player.id)
  );

  for (const [index, event] of events.entries()) {
    const before = copySnapshot(snapshot);
    const eventViolations: Violation[] = [];

    if (seenEventIds.has(event.id)) {
      eventViolations.push(
        violation(
          event,
          index,
          "DUPLICATE_EVENT_ID",
          "error",
          `event id ${event.id} is not unique`
        )
      );
    }
    seenEventIds.add(event.id);

    if (snapshot.gameStatus === "finished") {
      eventViolations.push(
        violation(
          event,
          index,
          "GAME_ALREADY_FINISHED",
          "error",
          "events after game end are not applied"
        )
      );
    } else {
      eventViolations.push(
        ...validateEvent(event, index, snapshot, config, allPlayerIds)
      );
    }
    violations.push(...eventViolations);

    if (
      violations.some(
        (item) => item.eventId === undefined && item.severity === "error"
      ) ||
      eventViolations.some((item) => item.severity === "error")
    ) {
      timeline.push(rejectedEntry(event, index, before));
      continue;
    }

    const team = eventTeam(event, snapshot);

    if (event.kind === "note") {
      const after = copySnapshot(snapshot);
      timeline.push({
        event,
        index,
        inning: before.inning,
        half: before.half,
        team,
        outsBefore: before.outs,
        outsAfter: before.outs,
        outsRecorded: 0,
        runsScored: 0,
        scoringMovements: [],
        applied: true,
        before,
        after,
      });
      continue;
    }

    if (event.kind === "gameControl") {
      snapshot.gameStatus = "finished";
      snapshot.gameEndReason = "manual";
      snapshot.gameEndReasonDetail = event.reason;
      const after = copySnapshot(snapshot);
      timeline.push({
        event,
        index,
        inning: before.inning,
        half: before.half,
        team,
        outsBefore: before.outs,
        outsAfter: before.outs,
        outsRecorded: 0,
        runsScored: 0,
        scoringMovements: [],
        applied: true,
        before,
        after,
      });
      continue;
    }

    if (event.kind === "substitution") {
      const slot = snapshot.activeLineup[event.team].indexOf(event.outPlayerId);
      if (slot >= 0) {
        snapshot.activeLineup[event.team][slot] = event.inPlayerId;
      }
      const positions = snapshot.fieldingPositions[event.team];
      const inheritedPosition =
        event.role === "pitcher"
          ? "pitcher"
          : event.role === "fielder"
            ? positions[event.outPlayerId]
            : undefined;
      const position = event.position ?? inheritedPosition;
      delete positions[event.outPlayerId];
      if (position) positions[event.inPlayerId] = position;
      if (event.role === "pitcher" || position === "pitcher") {
        snapshot.activePitcherId[event.team] = event.inPlayerId;
      }
      if (event.role === "pinchRunner") {
        for (const base of ["first", "second", "third"] as const) {
          if (snapshot.runners[base] === event.outPlayerId) {
            snapshot.runners[base] = event.inPlayerId;
          }
        }
      }
      const after = copySnapshot(snapshot);
      timeline.push({
        event,
        index,
        inning: before.inning,
        half: before.half,
        team,
        outsBefore: before.outs,
        outsAfter: before.outs,
        outsRecorded: 0,
        runsScored: 0,
        scoringMovements: [],
        applied: true,
        before,
        after,
      });
      continue;
    }

    if (event.kind === "positionChange") {
      for (const change of event.changes) {
        snapshot.fieldingPositions[event.team][change.playerId] =
          change.position;
        if (change.position === "pitcher") {
          snapshot.activePitcherId[event.team] = change.playerId;
        }
      }
      timeline.push(
        stateChangeEntry(event, index, team, before, copySnapshot(snapshot))
      );
      continue;
    }

    if (event.kind === "runnerPlacement") {
      snapshot.runners = { ...event.runners };
      timeline.push(
        stateChangeEntry(event, index, team, before, copySnapshot(snapshot))
      );
      continue;
    }

    const nextRunners = { ...snapshot.runners };
    for (const movement of event.movements) {
      if (movement.from !== "batter") nextRunners[movement.from] = null;
    }

    const { outsRecorded, scoringMovements } = evaluateMovementOutcome({
      currentOuts: snapshot.outs,
      movements: event.movements,
      ...(event.kind === "atBat"
        ? { batterId: event.batterId, result: event.result }
        : {}),
    });

    for (const movement of event.movements) {
      if (movement.to !== "out" && movement.to !== "home") {
        nextRunners[movement.to] = movement.playerId;
      }
    }

    snapshot.runners = nextRunners;
    snapshot.outs = Math.min(3, snapshot.outs + outsRecorded);
    snapshot.score[team] += scoringMovements.length;

    if (event.kind === "atBat") {
      const lineupLength = snapshot.activeLineup[team].length;
      snapshot.currentBatterIndex[team] =
        (snapshot.currentBatterIndex[team] + 1) % lineupLength;
    }

    let completedHalf: "top" | "bottom" | null = null;
    const outsAfter = snapshot.outs;
    if (snapshot.outs === 3) {
      completedHalf = snapshot.half;
      snapshot.outs = 0;
      snapshot.runners = { ...EMPTY_RUNNERS };
      if (snapshot.half === "top") {
        snapshot.half = "bottom";
      } else {
        snapshot.half = "top";
        snapshot.inning += 1;
      }
    }

    finishIfNeeded(snapshot, config, completedHalf);
    const after = copySnapshot(snapshot);
    timeline.push({
      event,
      index,
      inning: before.inning,
      half: before.half,
      team,
      outsBefore: before.outs,
      outsAfter,
      outsRecorded,
      runsScored: scoringMovements.length,
      scoringMovements,
      applied: true,
      before,
      after,
    });
  }

  return { snapshot, timeline, violations };
}
