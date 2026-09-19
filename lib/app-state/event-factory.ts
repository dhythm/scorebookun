import type {
  AtBatEvent,
  AtBatResult,
  BaseRunningEvent,
  BaseRunningType,
  BattedBall,
  FieldingPosition,
  GameControlEvent,
  GameNoteEvent,
  PositionChange,
  PositionChangeEvent,
  RunnerMovement,
  RunnerPlacementEvent,
  Runners,
  SubstitutionEvent,
  SubstitutionRole,
  TeamSide,
} from "../domain/types";
import {
  getDefaultMovements,
  normalizeAtBatResultFromMovements,
} from "../domain/rules";

const positionByLabel: Record<string, FieldingPosition> = {
  投: "pitcher",
  捕: "catcher",
  一: "first",
  二: "second",
  三: "third",
  遊: "short",
  左: "left",
  中: "center",
  右: "right",
};

export function mapAtBatSelectionResult(
  result: AtBatResult,
  detail: string
): AtBatResult {
  if (result === "sacrifice" && detail.includes("犠飛")) {
    return "sacrificeFly";
  }
  if (
    result === "otherOut" &&
    (detail === "内野安" || /^[投捕一二三遊]安/.test(detail))
  ) {
    return "single";
  }
  return result;
}

export function getDefaultMovementsForSelection(
  result: AtBatResult,
  detail: string | undefined,
  runners: Runners,
  batterId: string,
  currentOuts: number,
  battedBallOverride?: BattedBall
): RunnerMovement[] {
  const note = detail?.trim() ?? "";
  const domainResult = mapAtBatSelectionResult(result, note);
  return getDefaultMovements(domainResult, runners, batterId, currentOuts, {
    battedBall: battedBallOverride ?? parseBattedBall(domainResult, note),
    isInfieldHit:
      domainResult === "single" &&
      (note === "内野安" || /^[投捕一二三遊]安/.test(note)),
  });
}

function getConventionalDoublePlaySequence(
  position: FieldingPosition
): FieldingPosition[] | undefined {
  switch (position) {
    case "short":
      return ["short", "second", "first"];
    case "second":
      return ["second", "short", "first"];
    case "third":
      return ["third", "second", "first"];
    case "pitcher":
    case "catcher":
    case "first":
      return [position, "short", "first"];
    default:
      return undefined;
  }
}

function parseBattedBall(
  result: AtBatResult,
  detail: string
): BattedBall | undefined {
  const position = positionByLabel[detail[0]];
  if (!position) return undefined;
  if (result === "flyOut" || result === "sacrificeFly") {
    return { position, type: "fly" };
  }
  if (result === "sacrifice") return { position, type: "bunt" };
  if (
    result === "groundOut" ||
    result === "doublePlay" ||
    result === "fieldersChoice" ||
    result === "error" ||
    result === "otherOut" ||
    result === "single"
  ) {
    return { position, type: "ground" };
  }
  if (result === "double" || result === "triple" || result === "homerun") {
    return { position, type: "liner" };
  }
  return undefined;
}

export function createAtBatEvent({
  id,
  batterId,
  result: legacyResult,
  detail,
  movements,
  battedBall: battedBallOverride,
  fieldingSequence: fieldingSequenceOverride,
}: {
  id: string;
  batterId: string;
  result: AtBatResult;
  detail?: string;
  movements: RunnerMovement[];
  battedBall?: BattedBall;
  fieldingSequence?: FieldingPosition[];
}): AtBatEvent {
  const note = detail?.trim() ?? "";
  const selectedResult = mapAtBatSelectionResult(legacyResult, note);
  const result = normalizeAtBatResultFromMovements(
    selectedResult,
    movements,
    batterId
  );
  const battedBall = battedBallOverride ?? parseBattedBall(result, note);
  const orderedMovements =
    result === "doublePlay"
      ? movements.map((movement, index) => ({
          ...movement,
          playOrder: movement.playOrder ?? index + 1,
        }))
      : movements;
  const fieldingSequence =
    fieldingSequenceOverride ??
    (result === "doublePlay" && battedBall
      ? getConventionalDoublePlaySequence(battedBall.position)
      : undefined);
  return {
    id,
    kind: "atBat",
    batterId,
    result,
    ...(note ? { note } : {}),
    ...(battedBall ? { battedBall } : {}),
    ...(fieldingSequence ? { fieldingSequence } : {}),
    movements: orderedMovements,
  };
}

export function createBaseRunningEvent({
  id,
  type,
  movements,
  rbiCreditBatterId,
}: {
  id: string;
  type: BaseRunningType;
  movements: RunnerMovement[];
  rbiCreditBatterId?: string;
}): BaseRunningEvent {
  return {
    id,
    kind: "baseRunning",
    type,
    movements,
    ...(rbiCreditBatterId ? { rbiCreditBatterId } : {}),
  };
}

export function createSubstitutionEvent({
  id,
  team,
  inPlayerId,
  outPlayerId,
  role,
  position,
}: {
  id: string;
  team: TeamSide;
  inPlayerId: string;
  outPlayerId: string;
  role: SubstitutionRole;
  position?: FieldingPosition;
}): SubstitutionEvent {
  return {
    id,
    kind: "substitution",
    team,
    inPlayerId,
    outPlayerId,
    role,
    ...(position ? { position } : {}),
  };
}

export function createPositionChangeEvent({
  id,
  team,
  changes,
}: {
  id: string;
  team: TeamSide;
  changes: PositionChange[];
}): PositionChangeEvent {
  return { id, kind: "positionChange", team, changes };
}

export function createRunnerPlacementEvent({
  id,
  runners,
}: {
  id: string;
  runners: Runners;
}): RunnerPlacementEvent {
  return { id, kind: "runnerPlacement", runners: { ...runners } };
}

export function createGameControlEvent({
  id,
  reason,
}: {
  id: string;
  reason?: string;
}): GameControlEvent {
  return {
    id,
    kind: "gameControl",
    action: "endGame",
    ...(reason ? { reason } : {}),
  };
}

export function createGameNoteEvent({
  id,
  text,
}: {
  id: string;
  text: string;
}): GameNoteEvent {
  return {
    id,
    kind: "note",
    text: text.trim(),
  };
}
