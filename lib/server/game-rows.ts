import type {
  eventRunnerMovements,
  gameEvents,
  gamePlayers,
  games,
  gameTeams,
} from "@/lib/db/schema";
import type {
  GameEvent,
  Player,
  RunnerMovement,
  Team,
  TeamSide,
} from "@/lib/domain/types";
import type { SharedGame } from "@/lib/sync/shared-game";

type GameRow = Pick<
  typeof games.$inferSelect,
  "id" | "status" | "startedAt" | "regulationInnings"
>;
type TeamRow = typeof gameTeams.$inferSelect;
type PlayerRow = typeof gamePlayers.$inferSelect;
type EventRow = typeof gameEvents.$inferSelect;
type MovementRow = typeof eventRunnerMovements.$inferSelect;

export type GameRows = {
  game: GameRow;
  teams: TeamRow[];
  players: PlayerRow[];
  events: EventRow[];
  movements: MovementRow[];
};

const TEAM_SIDES: readonly TeamSide[] = ["away", "home"];

// Optional properties and NULL columns map to each other: a NULL column is an
// omitted property, so a game reads back exactly as it was written.
function definedOnly<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry != null)
  ) as T;
}

const EMPTY_EVENT_COLUMNS = {
  batterId: null,
  atBatResult: null,
  battedBallPosition: null,
  battedBallType: null,
  battedBallDepth: null,
  fieldingSequence: null,
  atBatNote: null,
  baseRunningType: null,
  rbiCreditBatterId: null,
  substitutionSide: null,
  inPlayerId: null,
  outPlayerId: null,
  substitutionRole: null,
  controlAction: null,
  controlReason: null,
  noteText: null,
} satisfies Partial<EventRow>;

function eventColumns(event: GameEvent): Partial<EventRow> {
  switch (event.kind) {
    case "atBat":
      return {
        batterId: event.batterId,
        atBatResult: event.result,
        battedBallPosition: event.battedBall?.position ?? null,
        battedBallType: event.battedBall?.type ?? null,
        battedBallDepth: event.battedBall?.depth ?? null,
        fieldingSequence: event.fieldingSequence ?? null,
        atBatNote: event.note ?? null,
      };
    case "baseRunning":
      return {
        baseRunningType: event.type,
        rbiCreditBatterId: event.rbiCreditBatterId ?? null,
      };
    case "substitution":
      return {
        substitutionSide: event.team,
        inPlayerId: event.inPlayerId,
        outPlayerId: event.outPlayerId,
        substitutionRole: event.role,
      };
    case "gameControl":
      return {
        controlAction: event.action,
        controlReason: event.reason ?? null,
      };
    case "note":
      return { noteText: event.text };
  }
}

export function toGameRows(game: SharedGame): GameRows {
  const startedAt = new Date(game.date);
  if (Number.isNaN(startedAt.getTime())) throw new Error("Invalid game date");
  const gameId = game.id;

  const players: PlayerRow[] = [];
  const teams = TEAM_SIDES.map((side): TeamRow => {
    const team = game.config.teams[side];
    const lists = [
      ["lineup", team.players],
      ["bench", team.benchPlayers ?? []],
    ] as const;
    for (const [rosterRole, list] of lists) {
      list.forEach((player, sequence) =>
        players.push({
          gameId,
          id: player.id,
          side,
          rosterRole,
          sequence,
          name: player.name,
          battingOrder: player.order,
          position: player.position ?? null,
        })
      );
    }
    return {
      gameId,
      side,
      name: team.name,
      startingPitcherId: team.startingPitcherId ?? null,
      startingPitcherName: team.startingPitcherName ?? null,
    };
  });

  const events: EventRow[] = [];
  const movements: MovementRow[] = [];
  function addEvent(
    event: GameEvent,
    position: Pick<EventRow, "state" | "sequence" | "restoreIndex">
  ) {
    events.push({
      gameId,
      id: event.id,
      kind: event.kind,
      ...position,
      ...EMPTY_EVENT_COLUMNS,
      ...eventColumns(event),
    });
    if (event.kind !== "atBat" && event.kind !== "baseRunning") return;
    event.movements.forEach((movement, sequence) =>
      movements.push({
        gameId,
        eventId: event.id,
        sequence,
        playerId: movement.playerId,
        origin: movement.from,
        destination: movement.to,
        isRbi: movement.isRBI,
        playOrder: movement.playOrder ?? null,
        outType: movement.outType ?? null,
      })
    );
  }
  game.events.forEach((event, sequence) =>
    addEvent(event, { state: "active", sequence, restoreIndex: null })
  );
  (game.deletedEvents ?? []).forEach(({ event, index }, sequence) =>
    addEvent(event, { state: "deleted", sequence, restoreIndex: index })
  );

  return {
    game: {
      id: gameId,
      status: game.status,
      startedAt,
      regulationInnings: game.config.regulationInnings,
    },
    teams,
    players,
    events,
    movements,
  };
}

const bySequence = (left: { sequence: number }, right: { sequence: number }) =>
  left.sequence - right.sequence;

function toEvent(row: EventRow, movements: RunnerMovement[]): GameEvent {
  switch (row.kind) {
    case "atBat":
      return definedOnly({
        id: row.id,
        kind: row.kind,
        batterId: row.batterId!,
        result: row.atBatResult!,
        battedBall: row.battedBallType
          ? definedOnly({
              position: row.battedBallPosition!,
              type: row.battedBallType,
              depth: row.battedBallDepth ?? undefined,
            })
          : undefined,
        fieldingSequence: row.fieldingSequence ?? undefined,
        note: row.atBatNote ?? undefined,
        movements,
      });
    case "baseRunning":
      return definedOnly({
        id: row.id,
        kind: row.kind,
        type: row.baseRunningType!,
        movements,
        rbiCreditBatterId: row.rbiCreditBatterId ?? undefined,
      });
    case "substitution":
      return {
        id: row.id,
        kind: row.kind,
        team: row.substitutionSide!,
        inPlayerId: row.inPlayerId!,
        outPlayerId: row.outPlayerId!,
        role: row.substitutionRole!,
      };
    case "gameControl":
      return definedOnly({
        id: row.id,
        kind: row.kind,
        action: row.controlAction!,
        reason: row.controlReason ?? undefined,
      });
    case "note":
      return { id: row.id, kind: row.kind, text: row.noteText! };
  }
}

export function fromGameRows(rows: GameRows): SharedGame {
  const movementsByEvent = new Map<string, RunnerMovement[]>();
  for (const row of [...rows.movements].sort(bySequence)) {
    const movements = movementsByEvent.get(row.eventId) ?? [];
    movements.push(
      definedOnly({
        playerId: row.playerId,
        from: row.origin,
        to: row.destination,
        isRBI: row.isRbi,
        playOrder: row.playOrder ?? undefined,
        outType: row.outType ?? undefined,
      })
    );
    movementsByEvent.set(row.eventId, movements);
  }

  function playersOf(side: TeamSide, rosterRole: PlayerRow["rosterRole"]) {
    return rows.players
      .filter((row) => row.side === side && row.rosterRole === rosterRole)
      .sort(bySequence)
      .map((row): Player =>
        definedOnly({
          id: row.id,
          name: row.name,
          order: row.battingOrder,
          position: row.position ?? undefined,
        })
      );
  }

  function teamOf(side: TeamSide): Team {
    const row = rows.teams.find((team) => team.side === side);
    if (!row) throw new Error(`Game ${rows.game.id} has no ${side} team`);
    const benchPlayers = playersOf(side, "bench");
    return definedOnly({
      name: row.name,
      players: playersOf(side, "lineup"),
      benchPlayers: benchPlayers.length > 0 ? benchPlayers : undefined,
      startingPitcherId: row.startingPitcherId ?? undefined,
      startingPitcherName: row.startingPitcherName ?? undefined,
    });
  }

  const eventsIn = (state: EventRow["state"]) =>
    rows.events.filter((row) => row.state === state).sort(bySequence);
  const deletedEvents = eventsIn("deleted").map((row) => ({
    event: toEvent(row, movementsByEvent.get(row.id) ?? []),
    index: row.restoreIndex!,
  }));

  return definedOnly({
    id: rows.game.id,
    date: rows.game.startedAt.toISOString(),
    status: rows.game.status,
    config: {
      regulationInnings: rows.game.regulationInnings,
      teams: { away: teamOf("away"), home: teamOf("home") },
    },
    events: eventsIn("active").map((row) =>
      toEvent(row, movementsByEvent.get(row.id) ?? [])
    ),
    deletedEvents: deletedEvents.length > 0 ? deletedEvents : undefined,
  });
}
