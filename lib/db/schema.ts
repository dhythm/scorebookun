import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Only what scorers record is stored. Scores, innings, and statistics are
// derived from the events by lib/domain/replay.ts and never persisted.

export const gameStatus = pgEnum("game_status", ["setup", "live", "finished"]);
export const teamSide = pgEnum("team_side", ["away", "home"]);
export const rosterRole = pgEnum("roster_role", ["lineup", "bench"]);
export const fieldingPosition = pgEnum("fielding_position", [
  "pitcher",
  "catcher",
  "first",
  "second",
  "third",
  "short",
  "left",
  "center",
  "right",
  "dh",
]);
export const eventState = pgEnum("event_state", ["active", "deleted"]);
export const eventKind = pgEnum("event_kind", [
  "atBat",
  "baseRunning",
  "substitution",
  "gameControl",
  "note",
]);
export const atBatResult = pgEnum("at_bat_result", [
  "single",
  "double",
  "triple",
  "homerun",
  "groundOut",
  "flyOut",
  "strikeout",
  "strikeoutSwinging",
  "strikeoutLooking",
  "doublePlay",
  "otherOut",
  "walk",
  "hitByPitch",
  "error",
  "sacrifice",
  "sacrificeFly",
  "fieldersChoice",
  "interference",
  "uncaughtThirdStrike",
]);
export const battedBallType = pgEnum("batted_ball_type", [
  "ground",
  "fly",
  "liner",
  "bunt",
]);
export const battedBallDepth = pgEnum("batted_ball_depth", ["shallow", "deep"]);
export const baseRunningType = pgEnum("base_running_type", [
  "steal",
  "caughtStealing",
  "wildPitch",
  "passedBall",
  "pickOff",
  "balk",
]);
export const substitutionRole = pgEnum("substitution_role", [
  "pinchHitter",
  "pinchRunner",
  "fielder",
  "pitcher",
]);
export const gameControlAction = pgEnum("game_control_action", ["endGame"]);
export const runnerOrigin = pgEnum("runner_origin", [
  "batter",
  "first",
  "second",
  "third",
]);
export const runnerDestination = pgEnum("runner_destination", [
  "first",
  "second",
  "third",
  "home",
  "out",
]);
export const outType = pgEnum("out_type", ["force", "tag"]);

export const games = pgTable(
  "games",
  {
    // Knowing the id is what grants access, so it must be unguessable.
    id: text("id").primaryKey(),
    // Incremented on every accepted save; stale writers are rejected.
    version: integer("version").notNull().default(1),
    // Lets a client safely retry a save whose response was lost.
    lastMutationId: text("last_mutation_id"),
    status: gameStatus("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    regulationInnings: integer("regulation_innings").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "games_regulation_innings_range",
      sql`${table.regulationInnings} between 1 and 20`
    ),
  ]
);

export const gameTeams = pgTable(
  "game_teams",
  {
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    side: teamSide("side").notNull(),
    name: text("name").notNull(),
    startingPitcherId: text("starting_pitcher_id"),
    startingPitcherName: text("starting_pitcher_name"),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.side] })]
);

export const gamePlayers = pgTable(
  "game_players",
  {
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    side: teamSide("side").notNull(),
    rosterRole: rosterRole("roster_role").notNull(),
    /** Position within the lineup or bench list. */
    sequence: integer("sequence").notNull(),
    name: text("name").notNull(),
    battingOrder: integer("batting_order").notNull(),
    position: fieldingPosition("position"),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.id] }),
    unique("game_players_list_position").on(
      table.gameId,
      table.side,
      table.rosterRole,
      table.sequence
    ),
  ]
);

// Player ids inside events deliberately have no foreign key: the domain keeps
// recording when an event names an unknown player and reports a violation
// instead, so the database must not refuse such a save.
export const gameEvents = pgTable(
  "game_events",
  {
    gameId: text("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    /** "deleted" rows are the trash; they can be restored. */
    state: eventState("state").notNull(),
    /** Chronological position within the active list or the trash. */
    sequence: integer("sequence").notNull(),
    /** Where a deleted event returns to in the active list. */
    restoreIndex: integer("restore_index"),
    kind: eventKind("kind").notNull(),

    batterId: text("batter_id"),
    atBatResult: atBatResult("at_bat_result"),
    battedBallPosition: fieldingPosition("batted_ball_position"),
    battedBallType: battedBallType("batted_ball_type"),
    battedBallDepth: battedBallDepth("batted_ball_depth"),
    /** Fielders handling the ball in order, for example short-second-first. */
    fieldingSequence: fieldingPosition("fielding_sequence").array(),
    atBatNote: text("at_bat_note"),

    baseRunningType: baseRunningType("base_running_type"),
    rbiCreditBatterId: text("rbi_credit_batter_id"),

    substitutionSide: teamSide("substitution_side"),
    inPlayerId: text("in_player_id"),
    outPlayerId: text("out_player_id"),
    substitutionRole: substitutionRole("substitution_role"),

    controlAction: gameControlAction("control_action"),
    controlReason: text("control_reason"),

    noteText: text("note_text"),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.id] }),
    unique("game_events_list_position").on(
      table.gameId,
      table.state,
      table.sequence
    ),
    check(
      "game_events_restore_index_matches_state",
      sql`(${table.state} = 'deleted') = (${table.restoreIndex} is not null)`
    ),
    check(
      "game_events_batted_ball_is_complete",
      sql`(${table.battedBallPosition} is null) = (${table.battedBallType} is null) and (${table.battedBallDepth} is null or ${table.battedBallType} is not null)`
    ),
    check(
      "game_events_kind_has_required_columns",
      sql`case ${table.kind}
        when 'atBat' then ${table.batterId} is not null and ${table.atBatResult} is not null
        when 'baseRunning' then ${table.baseRunningType} is not null
        when 'substitution' then ${table.substitutionSide} is not null and ${table.inPlayerId} is not null and ${table.outPlayerId} is not null and ${table.substitutionRole} is not null
        when 'gameControl' then ${table.controlAction} is not null
        when 'note' then ${table.noteText} is not null
      end`
    ),
  ]
);

export const eventRunnerMovements = pgTable(
  "event_runner_movements",
  {
    gameId: text("game_id").notNull(),
    eventId: text("event_id").notNull(),
    /** Chronological order within the play. */
    sequence: integer("sequence").notNull(),
    playerId: text("player_id").notNull(),
    origin: runnerOrigin("origin").notNull(),
    destination: runnerDestination("destination").notNull(),
    isRbi: boolean("is_rbi").notNull(),
    playOrder: integer("play_order"),
    outType: outType("out_type"),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.eventId, table.sequence] }),
    foreignKey({
      name: "event_runner_movements_event",
      columns: [table.gameId, table.eventId],
      foreignColumns: [gameEvents.gameId, gameEvents.id],
    }).onDelete("cascade"),
  ]
);
