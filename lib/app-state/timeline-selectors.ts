import type { TeamSide, TimelineEntry, Violation } from "../domain/types";

export interface RejectedEventIssue {
  entry: TimelineEntry;
  violations: Violation[];
}

export function getRejectedEventIssues(
  timeline: readonly TimelineEntry[],
  violations: readonly Violation[]
): RejectedEventIssue[] {
  return timeline.flatMap((entry) => {
    if (entry.applied) return [];
    return [
      {
        entry,
        violations: violations.filter(
          (violation) =>
            violation.severity === "error" &&
            violation.eventIndex === entry.index
        ),
      },
    ];
  });
}

export function getPlayerInningEntries(
  timeline: readonly TimelineEntry[],
  playerId: string,
  teamSide: TeamSide,
  inning: number
): TimelineEntry[] {
  return timeline.filter((entry) => {
    if (!entry.applied || entry.team !== teamSide || entry.inning !== inning) {
      return false;
    }
    if (entry.event.kind === "atBat") {
      return entry.event.batterId === playerId;
    }
    if (entry.event.kind === "baseRunning") {
      return entry.event.movements.some(
        (movement) => movement.playerId === playerId
      );
    }
    if (entry.event.kind === "runnerPlacement") {
      return Object.values(entry.event.runners).includes(playerId);
    }
    if (entry.event.kind === "positionChange") {
      return entry.event.changes.some((change) => change.playerId === playerId);
    }
    return (
      entry.event.kind === "substitution" &&
      (entry.event.inPlayerId === playerId ||
        entry.event.outPlayerId === playerId)
    );
  });
}
