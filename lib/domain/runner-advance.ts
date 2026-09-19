import type { AtBatResult, RunnerMovement, Snapshot } from "./types";

/** Apply after third-out scoring; the recorded movements remain untouched. */
export function limitWalkOffScoringMovements({
  scoringMovements,
  result,
  snapshot,
  regulationInnings,
}: {
  scoringMovements: RunnerMovement[];
  result?: AtBatResult;
  snapshot: Pick<Snapshot, "inning" | "half" | "score">;
  regulationInnings: number;
}): RunnerMovement[] {
  const runsNeededToWin = snapshot.score.away - snapshot.score.home + 1;
  if (
    snapshot.inning < regulationInnings ||
    snapshot.half !== "bottom" ||
    result === "homerun" ||
    scoringMovements.length <= runsNeededToWin
  ) {
    return scoringMovements;
  }
  // Credit the leading runners even if an import lists movements backwards.
  const baseOrder = { batter: 0, first: 1, second: 2, third: 3 };
  return [...scoringMovements]
    .sort((first, second) => baseOrder[second.from] - baseOrder[first.from])
    .slice(0, Math.max(0, runsNeededToWin));
}

type SupportedAtBatResult = AtBatResult | "strikeout" | "doublePlay";

interface RunnerRbiState {
  playerId: string;
  from: RunnerMovement["from"];
  to: RunnerMovement["to"];
}

export function initializeRbiByPlayerId(
  result: SupportedAtBatResult,
  runnerStates: readonly RunnerRbiState[],
  initialMovements: readonly RunnerMovement[],
  getDefault: (
    result: SupportedAtBatResult,
    from: RunnerMovement["from"],
    to: RunnerMovement["to"]
  ) => boolean
): Record<string, boolean> {
  const rbi: Record<string, boolean> = {};
  for (const runner of runnerStates) {
    if (runner.to !== "home") continue;
    const initialMovement = initialMovements.find(
      (movement) =>
        movement.playerId === runner.playerId &&
        movement.from === runner.from &&
        movement.to === runner.to
    );
    rbi[runner.playerId] =
      initialMovement?.isRBI ?? getDefault(result, runner.from, runner.to);
  }
  return rbi;
}

/** Results that by definition put the batter safely on first base. */
const BATTER_REACHES_FIRST_RESULTS: ReadonlySet<AtBatResult> = new Set([
  "single",
  "double",
  "triple",
  "homerun",
  "walk",
  "hitByPitch",
  "error",
  "fieldersChoice",
  "interference",
]);

/**
 * A batter put out after safely reaching first base is an ordinary tag out,
 * so runs that crossed the plate before it still count.
 */
function isBatterOutAfterReachingFirst(
  result: AtBatResult | undefined,
  movement: RunnerMovement
): boolean {
  return (
    movement.from === "batter" &&
    movement.to === "out" &&
    (movement.outType === "tag" ||
      (result !== undefined && BATTER_REACHES_FIRST_RESULTS.has(result)))
  );
}

/**
 * Evaluates outs and runs in chronological movement order.
 *
 * The array order is part of the scoring contract: on a tag third out, only
 * runners who reached home before that out score. A force third out, or a
 * batter put out before reaching first base, cancels every run from the play
 * regardless of order.
 */
export function evaluateMovementOutcome({
  currentOuts,
  movements,
  batterId,
  result,
}: {
  currentOuts: number;
  movements: readonly RunnerMovement[];
  batterId?: string;
  result?: AtBatResult;
}): {
  outsRecorded: number;
  scoringMovements: RunnerMovement[];
} {
  const outsNeededToEndHalf = 3 - currentOuts;
  const halfEndingOut = movements.filter((movement) => movement.to === "out")[
    outsNeededToEndHalf - 1
  ];
  const batterMakesHalfEndingOut =
    halfEndingOut?.from === "batter" &&
    batterId !== undefined &&
    halfEndingOut.playerId === batterId &&
    !isBatterOutAfterReachingFirst(result, halfEndingOut);
  const forcePlayMakesHalfEndingOut = halfEndingOut?.outType === "force";
  let outsRecorded = 0;
  const scoringMovements: RunnerMovement[] = [];

  for (const movement of movements) {
    if (movement.to === "out") {
      if (currentOuts + outsRecorded < 3) outsRecorded += 1;
    } else if (movement.to === "home" && currentOuts + outsRecorded < 3) {
      scoringMovements.push(movement);
    }
  }

  if (batterMakesHalfEndingOut || forcePlayMakesHalfEndingOut) {
    scoringMovements.length = 0;
  }

  return { outsRecorded, scoringMovements };
}
