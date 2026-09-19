import { formatEventNotation } from "../domain/notation";
import { replay } from "../domain/replay";
import type { Half } from "../domain/types";
import {
  createStorageEnvelope,
  type PersistedGameV2,
} from "../storage/local-storage";

const HALF_LABEL: Record<Half, string> = {
  top: "表",
  bottom: "裏",
};

export function exportGameAsJson(game: PersistedGameV2): string {
  return JSON.stringify(createStorageEnvelope(game), null, 2);
}

function displayDate(date: string): string {
  return date.includes("T") ? date.slice(0, date.indexOf("T")) : date;
}

export function exportGameAsText(game: PersistedGameV2): string {
  const replayResult = replay(game.events, game.config);
  const playerNameById = new Map(
    [
      ...game.config.teams.away.players,
      ...(game.config.teams.away.benchPlayers ?? []),
      ...game.config.teams.home.players,
      ...(game.config.teams.home.benchPlayers ?? []),
    ].map((player) => [player.id, player.name] as const)
  );
  const { away, home } = game.config.teams;
  const lines = [
    `${away.name} ${replayResult.snapshot.score.away} - ${replayResult.snapshot.score.home} ${home.name}`,
    displayDate(game.date),
    game.status === "finished" ? "試合終了" : "試合中",
    "",
  ];

  for (const entry of replayResult.timeline) {
    const event = entry.event;
    const actorId =
      event.kind === "atBat"
        ? event.batterId
        : event.kind === "baseRunning"
          ? event.movements[0]?.playerId
          : event.kind === "substitution"
            ? event.inPlayerId
            : undefined;
    const actor = actorId ? (playerNameById.get(actorId) ?? actorId) : "走者";
    const note =
      event.kind === "atBat" && event.note ? `（${event.note}）` : "";
    const situation =
      `${entry.inning}回${HALF_LABEL[entry.half]} ` +
      `${entry.outsBefore}アウト`;
    lines.push(
      event.kind === "gameControl" ||
        event.kind === "note" ||
        event.kind === "positionChange" ||
        event.kind === "runnerPlacement"
        ? `${situation} ${formatEventNotation(event)}`
        : `${situation} ${actor}: ${formatEventNotation(event)}${note}`
    );
  }

  return lines.join("\n");
}
