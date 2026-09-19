import type { TeamSide, TimelineEntry } from "./types";

export interface PitchingStats {
  outs: number;
  inningsPitched: string;
  hitsAllowed: number;
  runsAllowed: number;
  walksAllowed: number;
  strikeouts: number;
}

export interface PitcherStats extends PitchingStats {
  /**
   * `null` when the starter was entered by name only and has no roster id.
   * This keeps a DH/non-batting starter representable in the statistics API.
   */
  pitcherId: string | null;
  role: "starter" | "reliever";
}

const hitResults = new Set(["single", "double", "triple", "homerun"]);
const strikeoutResults = new Set([
  "strikeout",
  "strikeoutSwinging",
  "strikeoutLooking",
  "uncaughtThirdStrike",
]);

function formatInningsPitched(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

function getResponsiblePitcherId(
  responsiblePitcherByRunnerId: ReadonlyMap<string, string | null>,
  runnerId: string,
  fallbackPitcherId: string | null
): string | null {
  if (!responsiblePitcherByRunnerId.has(runnerId)) return fallbackPitcherId;
  return responsiblePitcherByRunnerId.get(runnerId) ?? null;
}

export function getStartingPitcherStats(
  timeline: readonly TimelineEntry[],
  fieldingTeam: TeamSide
): PitchingStats {
  const starter = getPitcherStats(timeline, fieldingTeam, null)[0];
  return {
    outs: starter.outs,
    inningsPitched: starter.inningsPitched,
    hitsAllowed: starter.hitsAllowed,
    runsAllowed: starter.runsAllowed,
    walksAllowed: starter.walksAllowed,
    strikeouts: starter.strikeouts,
  };
}

function emptyPitcherStats(
  pitcherId: string | null,
  role: PitcherStats["role"]
): PitcherStats {
  return {
    pitcherId,
    role,
    outs: 0,
    inningsPitched: "0.0",
    hitsAllowed: 0,
    runsAllowed: 0,
    walksAllowed: 0,
    strikeouts: 0,
  };
}

/**
 * Derives one line per pitcher from applied timeline entries.
 *
 * A starter id is optional because the setup model also permits a pitcher
 * entered by name only (for example, a DH lineup). Relief pitcher ids come
 * from structured pitching-substitution events. The replay/UI currently
 * requires substitutions to replace an active lineup slot, but this pure
 * derivation remains valid once a DH-specific defensive substitution model is
 * introduced.
 */
export function getPitcherStats(
  timeline: readonly TimelineEntry[],
  fieldingTeam: TeamSide,
  startingPitcherId: string | null
): PitcherStats[] {
  const battingTeam: TeamSide = fieldingTeam === "away" ? "home" : "away";
  const lines = new Map<string | null, PitcherStats>();
  lines.set(startingPitcherId, emptyPitcherStats(startingPitcherId, "starter"));
  let currentPitcherId = startingPitcherId;
  const responsiblePitcherByRunnerId = new Map<string, string | null>();

  const takeTheMound = (pitcherId: string) => {
    currentPitcherId = pitcherId;
    if (!lines.has(pitcherId)) {
      lines.set(pitcherId, emptyPitcherStats(pitcherId, "reliever"));
    }
  };

  for (const entry of timeline) {
    if (!entry.applied) continue;
    if (entry.event.kind === "positionChange") {
      const newPitcher =
        entry.event.team === fieldingTeam
          ? entry.event.changes.find((change) => change.position === "pitcher")
          : undefined;
      if (newPitcher) takeTheMound(newPitcher.playerId);
      continue;
    }
    if (entry.event.kind === "substitution") {
      if (
        entry.event.team === fieldingTeam &&
        (entry.event.role === "pitcher" || entry.event.position === "pitcher")
      ) {
        takeTheMound(entry.event.inPlayerId);
      } else if (
        entry.event.team === battingTeam &&
        entry.event.role === "pinchRunner" &&
        responsiblePitcherByRunnerId.has(entry.event.outPlayerId)
      ) {
        const responsiblePitcherId = getResponsiblePitcherId(
          responsiblePitcherByRunnerId,
          entry.event.outPlayerId,
          currentPitcherId
        );
        responsiblePitcherByRunnerId.delete(entry.event.outPlayerId);
        responsiblePitcherByRunnerId.set(
          entry.event.inPlayerId,
          responsiblePitcherId
        );
      }
      continue;
    }
    if (
      entry.event.kind === "gameControl" ||
      entry.event.kind === "note" ||
      entry.event.kind === "runnerPlacement"
    ) {
      continue;
    }
    if (entry.team !== battingTeam) continue;
    const stats = lines.get(currentPitcherId);
    if (!stats) continue;
    stats.outs += entry.outsRecorded;
    stats.inningsPitched = formatInningsPitched(stats.outs);

    for (const scoringMovement of entry.scoringMovements) {
      const responsiblePitcherId = getResponsiblePitcherId(
        responsiblePitcherByRunnerId,
        scoringMovement.playerId,
        currentPitcherId
      );
      const responsibleStats = lines.get(responsiblePitcherId);
      if (responsibleStats) responsibleStats.runsAllowed++;
      responsiblePitcherByRunnerId.delete(scoringMovement.playerId);
    }
    stats.runsAllowed += Math.max(
      0,
      entry.runsScored - entry.scoringMovements.length
    );

    if (entry.event.kind === "atBat" || entry.event.kind === "baseRunning") {
      for (const runnerMovement of entry.event.movements) {
        if (runnerMovement.to === "out" || runnerMovement.to === "home") {
          responsiblePitcherByRunnerId.delete(runnerMovement.playerId);
        }
      }
    }

    if (entry.event.kind === "atBat") {
      const batterMovement = entry.event.movements.find(
        (runnerMovement) => runnerMovement.from === "batter"
      );
      if (
        batterMovement &&
        batterMovement.to !== "out" &&
        batterMovement.to !== "home"
      ) {
        responsiblePitcherByRunnerId.set(
          entry.event.batterId,
          currentPitcherId
        );
      } else {
        responsiblePitcherByRunnerId.delete(entry.event.batterId);
      }
    }

    const halfInningEnded =
      entry.outsAfter >= 3 ||
      entry.before.inning !== entry.after.inning ||
      entry.before.half !== entry.after.half;
    if (halfInningEnded) responsiblePitcherByRunnerId.clear();

    if (entry.event.kind !== "atBat") continue;
    if (hitResults.has(entry.event.result)) stats.hitsAllowed++;
    if (entry.event.result === "walk") stats.walksAllowed++;
    if (strikeoutResults.has(entry.event.result)) stats.strikeouts++;
  }

  return [...lines.values()];
}
