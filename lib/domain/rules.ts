import type {
  AtBatEvent,
  AtBatResult,
  Base,
  BattedBall,
  RunnerMovement,
  Runners,
  Violation,
} from "./types";

export function normalizeAtBatResultFromMovements(
  result: AtBatResult,
  movements: readonly RunnerMovement[],
  batterId?: string
): AtBatResult {
  if (
    result === "groundOut" &&
    movements.filter((movement) => movement.to === "out").length >= 2
  ) {
    return "doublePlay";
  }
  if (
    result === "groundOut" &&
    movements.some(
      (movement) => movement.from !== "batter" && movement.to === "out"
    ) &&
    movements.some(
      (movement) =>
        movement.from === "batter" &&
        (batterId === undefined || movement.playerId === batterId) &&
        movement.to !== "out"
    )
  ) {
    return "fieldersChoice";
  }
  return result;
}

/** Derive sacrifice credit only after replay has resolved third-out scoring. */
export function normalizeSacrificeFlyResult(
  event: AtBatEvent,
  outsBefore: number,
  scoringMovements: readonly RunnerMovement[]
): AtBatResult {
  if (event.result !== "flyOut" && event.result !== "sacrificeFly") {
    return event.result;
  }
  const hasSacrificeRun =
    outsBefore < 2 &&
    scoringMovements.some(
      (movement) => movement.from !== "batter" && movement.isRBI
    );
  if (!hasSacrificeRun) return "flyOut";

  // Preserve an explicit sacrifice for a dropped catch judged by the scorer.
  if (event.result === "sacrificeFly") return "sacrificeFly";
  return event.movements.some(
    (movement) =>
      movement.playerId === event.batterId &&
      movement.from === "batter" &&
      movement.to === "out" &&
      movement.outType !== "tag"
  )
    ? "sacrificeFly"
    : "flyOut";
}

interface DefaultMovementContext {
  battedBall?: BattedBall;
  isInfieldHit?: boolean;
}

function isOutfieldPosition(
  position: BattedBall["position"] | undefined
): boolean {
  return position === "left" || position === "center" || position === "right";
}

function move(
  playerId: string,
  from: RunnerMovement["from"],
  to: RunnerMovement["to"],
  isRBI = false
): RunnerMovement {
  return { playerId, from, to, isRBI };
}

/**
 * Proposes forced advancement after the batter is awarded first base.
 * Runners who are not forced keep their bases and are omitted.
 */
function getForcedAdvanceMovements(
  runners: Runners,
  batterId: string,
  isRBI: boolean
): RunnerMovement[] {
  const movements: RunnerMovement[] = [];

  if (runners.first && runners.second && runners.third) {
    movements.push(move(runners.third, "third", "home", isRBI));
  }
  if (runners.first && runners.second) {
    movements.push(move(runners.second, "second", "third"));
  }
  if (runners.first) {
    movements.push(move(runners.first, "first", "second"));
  }
  movements.push(move(batterId, "batter", "first"));

  return movements;
}

/**
 * Returns the conventional default runner movements for an at-bat result.
 * These are proposals for the scoring UI; replay remains responsible for
 * applying them and enforcing three-out rules.
 */
export function getDefaultMovements(
  result: AtBatResult,
  runners: Runners,
  batterId: string,
  currentOuts = 0,
  context: DefaultMovementContext = {}
): RunnerMovement[] {
  switch (result) {
    case "homerun": {
      const movements: RunnerMovement[] = [];
      if (runners.third) {
        movements.push(move(runners.third, "third", "home", true));
      }
      if (runners.second) {
        movements.push(move(runners.second, "second", "home", true));
      }
      if (runners.first) {
        movements.push(move(runners.first, "first", "home", true));
      }
      movements.push(move(batterId, "batter", "home", true));
      return movements;
    }

    case "triple": {
      const movements: RunnerMovement[] = [];
      if (runners.third) {
        movements.push(move(runners.third, "third", "home", true));
      }
      if (runners.second) {
        movements.push(move(runners.second, "second", "home", true));
      }
      if (runners.first) {
        movements.push(move(runners.first, "first", "home", true));
      }
      movements.push(move(batterId, "batter", "third"));
      return movements;
    }

    case "double": {
      const isOutfieldHit = isOutfieldPosition(context.battedBall?.position);
      const movements: RunnerMovement[] = [];
      if (runners.third) {
        movements.push(move(runners.third, "third", "home", true));
      }
      if (runners.second) {
        movements.push(move(runners.second, "second", "home", true));
      }
      if (runners.first) {
        movements.push(
          move(
            runners.first,
            "first",
            isOutfieldHit ? "home" : "third",
            isOutfieldHit
          )
        );
      }
      movements.push(move(batterId, "batter", "second"));
      return movements;
    }

    case "single": {
      const isOutfieldHit = isOutfieldPosition(context.battedBall?.position);
      const isInfieldHit =
        context.isInfieldHit ||
        (context.battedBall?.type === "ground" && !isOutfieldHit);

      if (isInfieldHit) {
        return getForcedAdvanceMovements(runners, batterId, true);
      }

      const movements: RunnerMovement[] = [];
      if (runners.third) {
        movements.push(move(runners.third, "third", "home", true));
      }
      if (runners.second) {
        movements.push(
          move(
            runners.second,
            "second",
            isOutfieldHit ? "home" : "third",
            isOutfieldHit
          )
        );
      }
      if (runners.first) {
        movements.push(move(runners.first, "first", "second"));
      }
      movements.push(move(batterId, "batter", "first"));
      return movements;
    }

    case "error": {
      const isInfieldError =
        context.battedBall?.type === "ground" &&
        !isOutfieldPosition(context.battedBall.position);
      if (isInfieldError) {
        return getForcedAdvanceMovements(runners, batterId, false);
      }

      const movements: RunnerMovement[] = [];
      if (runners.third) {
        movements.push(move(runners.third, "third", "home"));
      }
      if (runners.second) {
        movements.push(move(runners.second, "second", "third"));
      }
      if (runners.first) {
        movements.push(move(runners.first, "first", "second"));
      }
      movements.push(move(batterId, "batter", "first"));
      return movements;
    }

    case "walk":
    case "hitByPitch":
      return getForcedAdvanceMovements(runners, batterId, true);

    case "interference":
      return getForcedAdvanceMovements(runners, batterId, true);

    case "uncaughtThirdStrike":
      if (!runners.first) {
        return [move(batterId, "batter", "first")];
      }
      if (currentOuts === 2) {
        return getForcedAdvanceMovements(runners, batterId, false);
      }
      return [move(batterId, "batter", "out")];

    case "sacrifice": {
      const movements: RunnerMovement[] = [];
      if (runners.third) {
        movements.push(move(runners.third, "third", "home", true));
      }
      if (runners.second) {
        movements.push(move(runners.second, "second", "third"));
      }
      if (runners.first) {
        movements.push(move(runners.first, "first", "second"));
      }
      movements.push(move(batterId, "batter", "out"));
      return movements;
    }

    case "sacrificeFly": {
      const movements: RunnerMovement[] = [];
      if (runners.third) {
        movements.push(move(runners.third, "third", "home", true));
      }
      if (runners.second) {
        movements.push(move(runners.second, "second", "third"));
      }
      movements.push(move(batterId, "batter", "out"));
      return movements;
    }

    case "fieldersChoice": {
      const movements: RunnerMovement[] = [];
      if (runners.first) {
        movements.push({
          ...move(runners.first, "first", "out"),
          outType: "force",
        });
      }
      movements.push(move(batterId, "batter", "first"));
      return movements;
    }

    case "groundOut": {
      if (context.battedBall?.type !== "ground") {
        return [move(batterId, "batter", "out")];
      }
      const movements: RunnerMovement[] = [];
      if (runners.third) {
        movements.push(move(runners.third, "third", "home", true));
      }
      if (runners.second) {
        movements.push(move(runners.second, "second", "third"));
      }
      if (runners.first) {
        movements.push({
          ...move(runners.first, "first", "out"),
          outType: "force",
        });
        movements.push(move(batterId, "batter", "first"));
      } else {
        movements.push(move(batterId, "batter", "out"));
      }
      return movements;
    }

    case "flyOut": {
      const movements: RunnerMovement[] = [];
      if (
        context.battedBall?.type === "fly" &&
        context.battedBall.depth === "deep" &&
        isOutfieldPosition(context.battedBall.position)
      ) {
        if (runners.third) {
          movements.push(move(runners.third, "third", "home", true));
        }
        if (runners.second) {
          movements.push(move(runners.second, "second", "third"));
        }
      }
      movements.push(move(batterId, "batter", "out"));
      return movements;
    }

    case "strikeout":
    case "strikeoutSwinging":
    case "strikeoutLooking":
    case "otherOut":
      return [move(batterId, "batter", "out")];

    case "doublePlay": {
      if (currentOuts >= 2 || !runners.first) {
        return [move(batterId, "batter", "out")];
      }
      return [
        {
          ...move(runners.first, "first", "out"),
          outType: "force",
          playOrder: 1,
        },
        { ...move(batterId, "batter", "out"), playOrder: 2 },
      ];
    }
  }
}

const baseOrder: Record<Base, number> = {
  first: 1,
  second: 2,
  third: 3,
};

/**
 * Validates structural invariants without applying movements.
 *
 * The function intentionally does not require every existing runner to have a
 * movement: omitted runners stay on their current bases.
 */
export function validateMovementShape(
  runners: Runners,
  batterId: string,
  movements: readonly RunnerMovement[]
): Violation[] {
  const violations: Violation[] = [];
  const sourceIndexes = new Map<RunnerMovement["from"], number>();
  const playerIndexes = new Map<string, number>();
  const destinationIndexes = new Map<Base, number>();
  const vacatedBases = new Set<Base>();

  for (const movement of movements) {
    if (movement.from !== "batter") {
      vacatedBases.add(movement.from);
    }
  }

  movements.forEach((movement, movementIndex) => {
    const expectedPlayer =
      movement.from === "batter" ? batterId : runners[movement.from];
    if (expectedPlayer !== movement.playerId) {
      violations.push({
        code: "SOURCE_RUNNER_MISMATCH",
        severity: "error",
        message: `${movement.playerId} is not the runner at ${movement.from}`,
      });
    }

    const previousSourceIndex = sourceIndexes.get(movement.from);
    if (previousSourceIndex !== undefined) {
      violations.push({
        code: "DUPLICATE_MOVEMENT_SOURCE",
        severity: "error",
        message: `${movement.from} is used by more than one movement`,
      });
    } else {
      sourceIndexes.set(movement.from, movementIndex);
    }

    const previousPlayerIndex = playerIndexes.get(movement.playerId);
    if (previousPlayerIndex !== undefined) {
      violations.push({
        code: "DUPLICATE_RUNNER_MOVEMENT",
        severity: "error",
        message: `${movement.playerId} has more than one movement`,
      });
    } else {
      playerIndexes.set(movement.playerId, movementIndex);
    }

    if (movement.to !== "home" && movement.to !== "out") {
      const previousDestinationIndex = destinationIndexes.get(movement.to);
      if (previousDestinationIndex !== undefined) {
        violations.push({
          code: "DUPLICATE_DESTINATION",
          severity: "error",
          message: `${movement.to} has more than one arriving runner`,
        });
      } else {
        destinationIndexes.set(movement.to, movementIndex);
      }

      const occupant = runners[movement.to];
      if (occupant && !vacatedBases.has(movement.to)) {
        violations.push({
          code: "DESTINATION_OCCUPIED",
          severity: "error",
          message: `${movement.to} is occupied by a runner who does not move`,
        });
      }

      const fromOrder =
        movement.from === "batter" ? 0 : baseOrder[movement.from];
      if (baseOrder[movement.to] < fromOrder) {
        violations.push({
          code: "BACKWARD_MOVEMENT",
          severity: "error",
          message: `${movement.playerId} moves backward`,
        });
      }
    }

    if (movement.isRBI && movement.to !== "home") {
      violations.push({
        code: "INVALID_RBI",
        severity: "error",
        message: "RBI credit requires a movement to home",
      });
    }
  });

  return violations;
}
