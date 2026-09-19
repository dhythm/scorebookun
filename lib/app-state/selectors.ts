import type {
  FieldingPosition,
  Player,
  Snapshot,
  TeamSide,
  TimelineEntry,
} from "../domain/types";
import type { PersistedGameV2 } from "../storage/local-storage";
import type { AppGame } from "./types";

function getCurrentTeamSide(game: AppGame): TeamSide {
  return game.currentState.half === "top" ? "away" : "home";
}

export function getPlayerById(game: AppGame, playerId: string): Player | null {
  return (
    game.config.teams.away.players.find((player) => player.id === playerId) ??
    game.config.teams.away.benchPlayers?.find(
      (player) => player.id === playerId
    ) ??
    game.config.teams.home.players.find((player) => player.id === playerId) ??
    game.config.teams.home.benchPlayers?.find(
      (player) => player.id === playerId
    ) ??
    null
  );
}

export function getCurrentBatter(game: AppGame): Player | null {
  return getBatterAtSnapshot(game, game.currentState);
}

export function getBatterAtSnapshot(
  game: AppGame,
  snapshot: Snapshot
): Player | null {
  const teamSide = snapshot.half === "top" ? "away" : "home";
  const roster = [
    ...game.config.teams[teamSide].players,
    ...(game.config.teams[teamSide].benchPlayers ?? []),
  ];
  const activePlayerIds = snapshot.activeLineup[teamSide];
  const batterIndex = snapshot.currentBatterIndex[teamSide];
  const playerId = activePlayerIds[batterIndex];
  return roster.find((player) => player.id === playerId) ?? null;
}

export function getNextBatter(game: AppGame): Player | null {
  const teamSide = getCurrentTeamSide(game);
  const roster = [
    ...game.config.teams[teamSide].players,
    ...(game.config.teams[teamSide].benchPlayers ?? []),
  ];
  const activePlayerIds = game.currentState.activeLineup[teamSide];
  if (activePlayerIds.length === 0) return null;
  const batterIndex = game.currentState.currentBatterIndex[teamSide];
  const playerId = activePlayerIds[(batterIndex + 1) % activePlayerIds.length];
  return roster.find((player) => player.id === playerId) ?? null;
}

/**
 * Every position a player has fielded, oldest first. A player who left the
 * game keeps their history, so the scorebook can still show where they played.
 */
export function getFieldingPositionHistory(
  game: AppGame,
  teamSide: TeamSide,
  playerId: string
): FieldingPosition[] {
  const snapshots = [
    game.timeline[0]?.before ?? game.currentState,
    ...game.timeline.filter((entry) => entry.applied).map(({ after }) => after),
  ];
  const history: FieldingPosition[] = [];
  for (const snapshot of snapshots) {
    const position = snapshot.fieldingPositions[teamSide][playerId];
    if (position && history.at(-1) !== position) history.push(position);
  }
  return history;
}

export function getTimelineEntry(
  game: AppGame,
  eventId: string
): TimelineEntry | null {
  return game.timeline.find((entry) => entry.event.id === eventId) ?? null;
}

export function getEffectiveInningCount(game: AppGame): number {
  const latestTimelineInning = game.timeline.reduce(
    (maximum, entry) => Math.max(maximum, entry.inning),
    0
  );
  return Math.max(
    game.config.regulationInnings,
    game.currentState.inning,
    latestTimelineInning
  );
}

export function toPersistedGame(game: AppGame): PersistedGameV2 {
  return {
    id: game.id,
    date: game.date,
    status: game.status,
    config: game.config,
    events: game.events,
    deletedEvents: game.deletedEvents,
    undoHistory: game.undoHistory,
    redoHistory: game.redoHistory,
  };
}
