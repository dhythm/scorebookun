import { replay } from "../domain/replay";
import type {
  GameConfig,
  GameEvent,
  Player,
  Team,
  Violation,
} from "../domain/types";
import type {
  DeletedEvent,
  GameRevision,
  PersistedGameV2,
} from "../storage/local-storage";
import type { AppGame, AppGameState, GameAction } from "./types";

function deriveGame(
  game: PersistedGameV2,
  manualEnded?: boolean,
  editState?: {
    deletedEvents: DeletedEvent[];
    undoHistory: GameRevision[];
    redoHistory: GameRevision[];
  }
): AppGame {
  const replayResult = replay(game.events, game.config);
  const inferredManualEnd =
    game.status === "finished" &&
    replayResult.snapshot.gameStatus !== "finished";
  const isManuallyEnded = manualEnded ?? inferredManualEnd;
  const status =
    isManuallyEnded || replayResult.snapshot.gameStatus === "finished"
      ? "finished"
      : "live";

  const fallbackUndoHistory =
    game.undoHistory ??
    game.events
      .slice(-MAX_EDIT_HISTORY)
      .map((_, relativeIndex, recentEvents) => {
        const removedCount = recentEvents.length - relativeIndex;
        return {
          events: game.events.slice(0, game.events.length - removedCount),
          deletedEvents: game.deletedEvents ?? [],
          status: isManuallyEnded ? ("finished" as const) : ("live" as const),
        };
      });

  return {
    id: game.id,
    date: game.date,
    config: game.config,
    events: game.events,
    deletedEvents: editState?.deletedEvents ?? game.deletedEvents ?? [],
    undoHistory: editState?.undoHistory ?? fallbackUndoHistory,
    redoHistory: editState?.redoHistory ?? game.redoHistory ?? [],
    manualEnded: isManuallyEnded,
    status,
    currentState: replayResult.snapshot,
    timeline: replayResult.timeline,
    violations: replayResult.violations,
    teams: game.config.teams,
    totalInnings: game.config.regulationInnings,
  };
}

const MAX_EDIT_HISTORY = 20;

function currentRevision(state: AppGame): GameRevision {
  return {
    events: state.events,
    deletedEvents: state.deletedEvents,
    status: state.status,
  };
}

function withMutation(
  state: AppGame,
  events: GameEvent[],
  deletedEvents = state.deletedEvents,
  status: "live" | "finished" = state.status
): AppGame {
  return deriveGame({ ...persistedInput(state, events), status }, undefined, {
    deletedEvents,
    undoHistory: [...state.undoHistory, currentRevision(state)].slice(
      -MAX_EDIT_HISTORY
    ),
    redoHistory: [],
  });
}

function fromRevision(
  state: AppGame,
  revision: GameRevision,
  undoHistory: GameRevision[],
  redoHistory: GameRevision[]
): AppGame {
  return deriveGame(
    {
      ...persistedInput(state, revision.events),
      status: revision.status,
    },
    undefined,
    {
      deletedEvents: revision.deletedEvents,
      undoHistory,
      redoHistory,
    }
  );
}

/** Applies a roster edit, which changes no play and no edit history. */
function withConfig(state: AppGame, config: GameConfig): AppGame {
  return deriveGame({ ...persistedInput(state), config }, state.manualEnded, {
    deletedEvents: state.deletedEvents,
    undoHistory: state.undoHistory,
    redoHistory: state.redoHistory,
  });
}

function rosterOf(team: Team): Player[] {
  return [...team.players, ...(team.benchPlayers ?? [])];
}

function persistedInput(
  state: AppGame,
  events = state.events
): PersistedGameV2 {
  return {
    id: state.id,
    date: state.date,
    status: state.status,
    config: state.config,
    events,
  };
}

export interface EventCommandResult {
  accepted: boolean;
  nextState: AppGame;
  violations: Violation[];
  invalidatedEventIds: string[];
}

function getNewlyInvalidatedEventIds(
  state: AppGame,
  nextState: AppGame
): string[] {
  const wasAppliedByEventId = new Map(
    state.timeline.map((entry) => [entry.event.id, entry.applied])
  );
  return nextState.timeline.flatMap((entry) =>
    wasAppliedByEventId.get(entry.event.id) === true && !entry.applied
      ? [entry.event.id]
      : []
  );
}

export function evaluateEventAddition(
  state: AppGame,
  event: GameEvent
): EventCommandResult {
  const nextState = deriveGame(
    persistedInput(state, [...state.events, event]),
    state.manualEnded
  );
  const entry = nextState.timeline.at(-1);
  return {
    accepted: entry?.event.id === event.id && entry.applied,
    nextState,
    violations: nextState.violations.filter(
      (item) => item.eventId === event.id
    ),
    invalidatedEventIds: [],
  };
}

export function evaluateEventUpdate(
  state: AppGame,
  eventId: string,
  replacement: GameEvent
): EventCommandResult | null {
  const eventIndex = state.events.findIndex((event) => event.id === eventId);
  if (eventIndex === -1) return null;
  const events = [...state.events];
  const event = { ...replacement, id: eventId };
  events[eventIndex] = event;
  const nextState = deriveGame(
    persistedInput(state, events),
    state.manualEnded
  );
  const entry = nextState.timeline[eventIndex];
  return {
    accepted: entry?.event.id === eventId && entry.applied,
    nextState,
    violations: nextState.violations.filter((item) => item.eventId === eventId),
    invalidatedEventIds: getNewlyInvalidatedEventIds(state, nextState),
  };
}

export function evaluateEventDeletion(
  state: AppGame,
  eventId: string
): EventCommandResult | null {
  if (!state.events.some((event) => event.id === eventId)) return null;
  const events = state.events.filter((event) => event.id !== eventId);
  const nextState = deriveGame(
    persistedInput(state, events),
    state.manualEnded
  );
  return {
    accepted: true,
    nextState,
    violations: nextState.violations.filter(
      (item) => item.eventId !== undefined
    ),
    invalidatedEventIds: getNewlyInvalidatedEventIds(state, nextState),
  };
}

export function gameReducer(
  state: AppGameState,
  action: GameAction
): AppGameState {
  switch (action.type) {
    case "START_GAME":
      return deriveGame({
        id: action.id,
        date: action.date,
        status: "live",
        config: action.config,
        events: [],
      });

    case "LOAD_GAME":
      return deriveGame(action.game);

    case "RESET_GAME":
      return null;

    case "ADD_EVENT":
      if (!state) return null;
      {
        const result = evaluateEventAddition(state, action.event);
        return result.accepted
          ? withMutation(state, result.nextState.events)
          : state;
      }

    case "UPDATE_EVENT": {
      if (!state) return null;
      const result = evaluateEventUpdate(state, action.eventId, action.event);
      return result?.accepted
        ? withMutation(state, result.nextState.events)
        : state;
    }

    case "DELETE_EVENT": {
      if (!state) return null;
      const result = evaluateEventDeletion(state, action.eventId);
      if (!result) return state;
      const index = state.events.findIndex(
        (event) => event.id === action.eventId
      );
      const event = state.events[index];
      return withMutation(state, result.nextState.events, [
        ...state.deletedEvents.filter(
          (deleted) => deleted.event.id !== action.eventId
        ),
        { event, index },
      ]);
    }

    case "RESTORE_DELETED_EVENT": {
      if (!state) return null;
      const deleted = state.deletedEvents.find(
        (item) => item.event.id === action.eventId
      );
      if (!deleted) return state;
      const events = [...state.events];
      events.splice(Math.min(deleted.index, events.length), 0, deleted.event);
      return withMutation(
        state,
        events,
        state.deletedEvents.filter((item) => item.event.id !== action.eventId)
      );
    }

    case "RESTORE_HALF_INNING_START": {
      if (!state) return null;
      const index = state.timeline.findIndex(
        (entry) =>
          entry.inning === state.currentState.inning &&
          entry.half === state.currentState.half
      );
      if (index < 0 || index >= state.events.length) return state;
      return withMutation(state, state.events.slice(0, index));
    }

    case "UNDO_LAST_EVENT":
      if (!state || state.undoHistory.length === 0) return state;
      return fromRevision(
        state,
        state.undoHistory.at(-1)!,
        state.undoHistory.slice(0, -1),
        [...state.redoHistory, currentRevision(state)].slice(-MAX_EDIT_HISTORY)
      );

    case "REDO_LAST_EVENT":
      if (!state || state.redoHistory.length === 0) return state;
      return fromRevision(
        state,
        state.redoHistory.at(-1)!,
        [...state.undoHistory, currentRevision(state)].slice(-MAX_EDIT_HISTORY),
        state.redoHistory.slice(0, -1)
      );

    case "ADD_BENCH_PLAYER": {
      if (!state) return null;
      const name = action.player.name.trim();
      const { away, home } = state.config.teams;
      const idTaken = [...rosterOf(away), ...rosterOf(home)].some(
        (player) => player.id === action.player.id
      );
      if (!name || idTaken) return state;
      const team = state.config.teams[action.team];
      const benchPlayers = team.benchPlayers ?? [];
      return withConfig(state, {
        ...state.config,
        teams: {
          ...state.config.teams,
          [action.team]: {
            ...team,
            benchPlayers: [
              ...benchPlayers,
              {
                id: action.player.id,
                name,
                order: team.players.length + benchPlayers.length + 1,
                position: null,
              },
            ],
          },
        },
      });
    }

    case "RENAME_PLAYER": {
      if (!state) return null;
      const name = action.name.trim();
      if (!name) return state;
      const rename = (player: Player): Player =>
        player.id === action.playerId ? { ...player, name } : player;
      const renameIn = (team: Team): Team => ({
        ...team,
        players: team.players.map(rename),
        ...(team.benchPlayers
          ? { benchPlayers: team.benchPlayers.map(rename) }
          : {}),
        ...(team.startingPitcherId === action.playerId
          ? { startingPitcherName: name }
          : {}),
      });
      return withConfig(state, {
        ...state.config,
        teams: {
          away: renameIn(state.config.teams.away),
          home: renameIn(state.config.teams.home),
        },
      });
    }

    case "RESUME_GAME":
      if (!state) return null;
      return withMutation(
        state,
        state.events.at(-1)?.kind === "gameControl"
          ? state.events.slice(0, -1)
          : state.events,
        state.deletedEvents,
        "live"
      );
  }
}
