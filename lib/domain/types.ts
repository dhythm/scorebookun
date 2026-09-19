export type TeamSide = "away" | "home";
export type Half = "top" | "bottom";
export type Base = "first" | "second" | "third";
type RunnerOrigin = "batter" | Base;
export type RunnerDestination = Base | "home" | "out";

export type FieldingPosition =
  | "pitcher"
  | "catcher"
  | "first"
  | "second"
  | "third"
  | "short"
  | "left"
  | "center"
  | "right"
  | "dh";

export type AtBatResult =
  | "single"
  | "double"
  | "triple"
  | "homerun"
  | "groundOut"
  | "flyOut"
  | "strikeout"
  | "strikeoutSwinging"
  | "strikeoutLooking"
  | "doublePlay"
  | "otherOut"
  | "walk"
  | "hitByPitch"
  | "error"
  | "sacrifice"
  | "sacrificeFly"
  | "fieldersChoice"
  | "interference"
  | "uncaughtThirdStrike";

export type BaseRunningType =
  | "steal"
  | "caughtStealing"
  | "wildPitch"
  | "passedBall"
  | "pickOff"
  | "balk"
  /** Advance on a throw, a fielding error, or any play not listed above. */
  | "otherAdvance"
  /** Runner put out between at-bats: overrun, interference, appeal, etc. */
  | "otherOut";

export interface Player {
  id: string;
  name: string;
  order: number;
  position?: FieldingPosition | null;
}

export interface Team {
  name: string;
  players: Player[];
  /** Players available to enter the game but not in the starting lineup. */
  benchPlayers?: Player[];
  startingPitcherId?: string | null;
  startingPitcherName?: string;
}

export interface GameConfig {
  regulationInnings: number;
  teams: {
    away: Team;
    home: Team;
  };
}

export interface Runners {
  first: string | null;
  second: string | null;
  third: string | null;
}

export interface RunnerMovement {
  playerId: string;
  from: RunnerOrigin;
  to: RunnerDestination;
  isRBI: boolean;
  /** Explicit chronological order within a multi-runner play. */
  playOrder?: number;
  /**
   * Describes how an out was recorded when that distinction affects scoring.
   * Omitted for legacy events and for outs where the distinction is irrelevant.
   */
  outType?: "force" | "tag";
}

export interface BattedBall {
  position: FieldingPosition;
  type: "ground" | "fly" | "liner" | "bunt";
  /** Used by fly-out defaults only when a runner can tag up. */
  depth?: "shallow" | "deep";
}

export interface AtBatEvent {
  id: string;
  kind: "atBat";
  batterId: string;
  result: AtBatResult;
  battedBall?: BattedBall;
  /** Fielders handling the ball in chronological order (for example 6-4-3). */
  fieldingSequence?: FieldingPosition[];
  note?: string;
  /**
   * Runner outcomes in chronological play order. On a tag third out, this
   * order determines whether a preceding run scores.
   */
  movements: RunnerMovement[];
}

export interface BaseRunningEvent {
  id: string;
  kind: "baseRunning";
  type: BaseRunningType;
  /** Runner outcomes in chronological play order. */
  movements: RunnerMovement[];
  rbiCreditBatterId?: string;
}

export type SubstitutionRole =
  "pinchHitter" | "pinchRunner" | "fielder" | "pitcher";

export interface SubstitutionEvent {
  id: string;
  kind: "substitution";
  team: TeamSide;
  inPlayerId: string;
  outPlayerId: string;
  role: SubstitutionRole;
  /**
   * Position the incoming player takes. Omitted for legacy events; a
   * defensive substitute then inherits the outgoing player's position.
   */
  position?: FieldingPosition;
}

export interface PositionChange {
  playerId: string;
  position: FieldingPosition;
}

/** Players already in the game trade fielding positions. */
export interface PositionChangeEvent {
  id: string;
  kind: "positionChange";
  team: TeamSide;
  changes: PositionChange[];
}

/**
 * Sets the bases outright, without a play: tie-break runners at the start of
 * a half-inning, or an umpire ruling that sends runners elsewhere.
 */
export interface RunnerPlacementEvent {
  id: string;
  kind: "runnerPlacement";
  runners: Runners;
}

export interface GameControlEvent {
  id: string;
  kind: "gameControl";
  action: "endGame";
  reason?: string;
}

export interface GameNoteEvent {
  id: string;
  kind: "note";
  text: string;
}

export type GameEvent =
  | AtBatEvent
  | BaseRunningEvent
  | SubstitutionEvent
  | PositionChangeEvent
  | RunnerPlacementEvent
  | GameControlEvent
  | GameNoteEvent;

type GameEndReason =
  "homeAheadAfterTop" | "walkOff" | "completedHalf" | "manual";

interface Score {
  away: number;
  home: number;
}

export interface Snapshot {
  inning: number;
  half: Half;
  outs: number;
  runners: Runners;
  /** Current player id in each batting-order slot. */
  activeLineup: Record<TeamSide, string[]>;
  /** Current pitcher, independent from the batting order for DH games. */
  activePitcherId: Record<TeamSide, string | null>;
  /** Current fielding position of each player in the game. */
  fieldingPositions: Record<TeamSide, Record<string, FieldingPosition>>;
  currentBatterIndex: Record<TeamSide, number>;
  score: Score;
  gameStatus: "live" | "finished";
  gameEndReason?: GameEndReason;
  gameEndReasonDetail?: string;
}

type ViolationSeverity = "warning" | "error";

type ViolationCode =
  | "INVALID_REGULATION_INNINGS"
  | "EMPTY_LINEUP"
  | "DUPLICATE_PLAYER_ID"
  | "DUPLICATE_EVENT_ID"
  | "GAME_ALREADY_FINISHED"
  | "WRONG_BATTER"
  | "UNKNOWN_PLAYER"
  | "PLAYER_NOT_ON_OFFENSE"
  | "DUPLICATE_MOVEMENT_SOURCE"
  | "DUPLICATE_RUNNER_MOVEMENT"
  | "SOURCE_RUNNER_MISMATCH"
  | "BATTER_SOURCE_NOT_ALLOWED"
  | "DESTINATION_OCCUPIED"
  | "DUPLICATE_DESTINATION"
  | "BACKWARD_MOVEMENT"
  | "INVALID_RBI"
  | "OUTS_EXCEED_HALF_INNING"
  | "EMPTY_GAME_NOTE"
  | "GAME_NOTE_TOO_LONG"
  | "SUBSTITUTION_PLAYER_NOT_ON_TEAM"
  | "SUBSTITUTION_OUT_PLAYER_NOT_ACTIVE"
  | "SUBSTITUTION_IN_PLAYER_ALREADY_ACTIVE"
  | "SUBSTITUTION_RUNNER_NOT_FOUND"
  | "EMPTY_POSITION_CHANGE"
  | "POSITION_CHANGE_PLAYER_NOT_ACTIVE";

export interface Violation {
  code: ViolationCode;
  severity: ViolationSeverity;
  message: string;
  eventId?: string;
  eventIndex?: number;
}

export interface TimelineEntry {
  event: GameEvent;
  index: number;
  inning: number;
  half: Half;
  team: TeamSide;
  outsBefore: number;
  outsAfter: number;
  outsRecorded: number;
  runsScored: number;
  scoringMovements: RunnerMovement[];
  applied: boolean;
  before: Snapshot;
  after: Snapshot;
}

export interface ReplayResult {
  snapshot: Snapshot;
  timeline: TimelineEntry[];
  violations: Violation[];
}
