import type {
  AtBatEvent,
  AtBatResult,
  Base,
  BaseRunningEvent,
  BattedBall,
  FieldingPosition,
  GameEvent,
  GameControlEvent,
  GameNoteEvent,
  RunnerDestination,
  RunnerMovement,
  RunnerPlacementEvent,
  SubstitutionEvent,
} from "./types";
import { normalizeAtBatResultFromMovements } from "./rules";

export type NotationAtBatResult = AtBatResult;

const POSITION_SHORT: Record<FieldingPosition, string> = {
  pitcher: "投",
  catcher: "捕",
  first: "一",
  second: "二",
  third: "三",
  short: "遊",
  left: "左",
  center: "中",
  right: "右",
  dh: "指",
};

export function formatFieldingPosition(position: FieldingPosition): string {
  return POSITION_SHORT[position];
}

function positionPrefix(battedBall?: BattedBall): string {
  return battedBall ? formatFieldingPosition(battedBall.position) : "";
}

export function formatAtBatResult(
  result: NotationAtBatResult,
  battedBall?: BattedBall
): string {
  const position = positionPrefix(battedBall);

  switch (result) {
    case "single":
      return position ? `${position}安` : "安打";
    case "double":
      return position ? `${position}2` : "二塁打";
    case "triple":
      return position ? `${position}3` : "三塁打";
    case "homerun":
      return position ? `${position}本` : "本塁打";
    case "groundOut":
      return `${position}ゴロ`;
    case "flyOut":
      return `${position}飛`;
    case "strikeout":
      return "三振";
    case "strikeoutSwinging":
      return "空三振";
    case "strikeoutLooking":
      return "見三振";
    case "doublePlay":
      return position ? `${position}併` : "併殺";
    case "otherOut":
      return "アウト";
    case "walk":
      return "四球";
    case "hitByPitch":
      return "死球";
    case "error":
      return position ? `${position}失` : "失策";
    case "sacrifice":
      return position ? `${position}犠打` : "犠打";
    case "sacrificeFly":
      return position ? `${position}犠飛` : "犠飛";
    case "fieldersChoice":
      return position ? `${position}野選` : "野選";
    case "interference":
      return "打妨";
    case "uncaughtThirdStrike":
      return "振逃";
  }
}

export function formatAtBatNotation(
  event: Pick<
    AtBatEvent,
    "result" | "battedBall" | "fieldingSequence" | "movements"
  >
): string {
  const normalizedResult = normalizeAtBatResultFromMovements(
    event.result,
    event.movements
  );
  if (
    normalizedResult === "doublePlay" &&
    event.fieldingSequence &&
    event.fieldingSequence.length > 0
  ) {
    const positionNumber: Record<FieldingPosition, number> = {
      pitcher: 1,
      catcher: 2,
      first: 3,
      second: 4,
      third: 5,
      short: 6,
      left: 7,
      center: 8,
      right: 9,
      dh: 0,
    };
    return `${event.fieldingSequence
      .map((position) => positionNumber[position])
      .join("-")} 併`;
  }
  return formatAtBatResult(normalizedResult, event.battedBall);
}

const BASE_LABEL: Record<Base, string> = {
  first: "1",
  second: "2",
  third: "3",
};

function destinationLabel(destination: RunnerDestination): string {
  if (destination === "home") return "本";
  if (destination === "out") return "死";
  return BASE_LABEL[destination];
}

function movementLabel(movement: RunnerMovement): string {
  const from = movement.from === "batter" ? "打" : BASE_LABEL[movement.from];
  return `${from}→${destinationLabel(movement.to)}`;
}

export function formatBaseRunningNotation(event: BaseRunningEvent): string {
  if (event.movements.length === 0) {
    const fallback: Record<BaseRunningEvent["type"], string> = {
      steal: "盗",
      caughtStealing: "盗死",
      wildPitch: "WP",
      passedBall: "PB",
      pickOff: "牽制死",
      balk: "ボーク",
      otherAdvance: "進塁",
      otherOut: "走塁死",
    };
    return fallback[event.type];
  }

  const movements = event.movements;
  const movementList = movements.map(movementLabel).join("・");

  switch (event.type) {
    case "steal":
      return movements
        .map((movement) => `盗${destinationLabel(movement.to)}`)
        .join("・");
    case "caughtStealing":
      return `盗死·${movementList}`;
    case "wildPitch":
      return `WP·${movementList}`;
    case "passedBall":
      return `PB·${movementList}`;
    case "pickOff":
      return `牽制死·${movementList}`;
    case "balk":
      return movements.every((movement) => movement.to === "out")
        ? "ボーク死"
        : `ボーク·${movementList}`;
    case "otherAdvance":
      return `進塁·${movementList}`;
    case "otherOut":
      return `走塁死·${movementList}`;
  }
}

export function formatEventNotation(event: GameEvent): string {
  switch (event.kind) {
    case "atBat":
      return formatAtBatNotation(event);
    case "baseRunning":
      return formatBaseRunningNotation(event);
    case "substitution":
      return formatSubstitutionNotation(event);
    case "positionChange":
      return "守備位置変更";
    case "runnerPlacement":
      return formatRunnerPlacementNotation(event);
    case "note":
      return formatGameNoteNotation(event);
    case "gameControl":
      return formatGameControlNotation(event);
  }
}

export function formatRunnerPlacementNotation(
  event: Pick<RunnerPlacementEvent, "runners">
): string {
  const bases = (["first", "second", "third"] as const)
    .filter((base) => event.runners[base] !== null)
    .map((base) => BASE_LABEL[base]);
  return bases.length > 0
    ? `走者配置（${bases.join("・")}塁）`
    : "走者なしに変更";
}

export function formatGameNoteNotation(
  event: Pick<GameNoteEvent, "text">
): string {
  return `メモ: ${event.text}`;
}

export function formatSubstitutionNotation(
  event: Pick<SubstitutionEvent, "role">
): string {
  const labels: Record<SubstitutionEvent["role"], string> = {
    pinchHitter: "代打",
    pinchRunner: "代走",
    fielder: "守備交代",
    pitcher: "投手交代",
  };
  return labels[event.role];
}

export function formatGameControlNotation(
  event: Pick<GameControlEvent, "action" | "reason">
): string {
  return event.reason ? `試合終了（${event.reason}）` : "試合終了";
}
