import type {
  GameConfig,
  GameEvent,
  Snapshot,
  TeamSide,
  TimelineEntry,
  Violation,
} from "../domain/types";
import type {
  DeletedEvent,
  GameRevision,
  PersistedGameV2,
} from "../storage/local-storage";

type AppGameStatus = "live" | "finished";

/**
 * In-memory game view.
 *
 * `config` and `events` are the persisted source of truth. The remaining game
 * progress fields are rebuilt by replay and must not be persisted.
 */
export interface AppGame {
  id: string;
  date: string;
  config: GameConfig;
  events: GameEvent[];
  deletedEvents: DeletedEvent[];
  undoHistory: GameRevision[];
  redoHistory: GameRevision[];
  manualEnded: boolean;
  status: AppGameStatus;
  currentState: Snapshot;
  timeline: TimelineEntry[];
  violations: Violation[];
  /** Compatibility alias for UI code while it moves to `config`. */
  teams: GameConfig["teams"];
  /** Compatibility alias for UI code while it moves to `config`. */
  totalInnings: number;
}

export type AppGameState = AppGame | null;

export type GameAction =
  | {
      type: "START_GAME";
      id: string;
      date: string;
      config: GameConfig;
    }
  | { type: "ADD_EVENT"; event: GameEvent }
  | {
      type: "UPDATE_EVENT";
      eventId: string;
      event: GameEvent;
    }
  | { type: "DELETE_EVENT"; eventId: string }
  | { type: "RESTORE_DELETED_EVENT"; eventId: string }
  | { type: "RESTORE_HALF_INNING_START" }
  | { type: "UNDO_LAST_EVENT" }
  | { type: "REDO_LAST_EVENT" }
  | { type: "RESUME_GAME" }
  /** Roster edits are not plays, so they stay outside undo and redo. */
  | {
      type: "ADD_BENCH_PLAYER";
      team: TeamSide;
      player: { id: string; name: string };
    }
  | { type: "RENAME_PLAYER"; playerId: string; name: string }
  | { type: "RESET_GAME" }
  | { type: "LOAD_GAME"; game: PersistedGameV2 };
