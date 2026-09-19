import { replay } from "@/lib/domain/replay";
import { getDefaultMovements } from "@/lib/domain/rules";
import type {
  AtBatResult,
  Base,
  BaseRunningType,
  BattedBall,
  FieldingPosition,
  GameConfig,
  GameEvent,
  RunnerMovement,
  Snapshot,
  SubstitutionRole,
  TeamSide,
} from "@/lib/domain/types";

/** Scorebook position numbers, 1 (pitcher) to 9 (right field). */
const POSITIONS: readonly FieldingPosition[] = [
  "pitcher",
  "catcher",
  "first",
  "second",
  "third",
  "short",
  "left",
  "center",
  "right",
];

const AT_BAT_CODES: Record<
  string,
  { result: AtBatResult; type?: BattedBall["type"] }
> = {
  K: { result: "strikeoutSwinging" },
  KL: { result: "strikeoutLooking" },
  BB: { result: "walk" },
  HBP: { result: "hitByPitch" },
  G: { result: "groundOut", type: "ground" },
  F: { result: "flyOut", type: "fly" },
  L: { result: "flyOut", type: "liner" },
  DP: { result: "doublePlay", type: "ground" },
  FC: { result: "fieldersChoice", type: "ground" },
  E: { result: "error", type: "ground" },
  SAC: { result: "sacrifice", type: "bunt" },
  SF: { result: "sacrificeFly", type: "fly" },
  "1B": { result: "single", type: "liner" },
  "2B": { result: "double", type: "liner" },
  "3B": { result: "triple", type: "fly" },
  HR: { result: "homerun", type: "fly" },
};

const BASE_RUNNING_CODES: Record<string, BaseRunningType> = {
  SB: "steal",
  WP: "wildPitch",
  PB: "passedBall",
};

const NEXT_BASE = { first: "second", second: "third", third: "home" } as const;
const BASES_FROM_HOME: readonly Base[] = ["third", "second", "first"];

function advanceMovements(
  runners: Snapshot["runners"],
  onlyLeadRunner: boolean
): RunnerMovement[] {
  const movements: RunnerMovement[] = [];
  const occupied = new Set(BASES_FROM_HOME.filter((base) => runners[base]));
  for (const base of BASES_FROM_HOME) {
    const playerId = runners[base];
    const to = NEXT_BASE[base];
    if (!playerId || (to !== "home" && occupied.has(to))) continue;
    movements.push({ playerId, from: base, to, isRBI: false });
    occupied.delete(base);
    if (onlyLeadRunner) break;
  }
  return movements;
}

/**
 * Builds a game the way a scorer would: play by play, for whoever is at bat,
 * with the same default runner advances the scoring screen proposes. Every
 * play is replayed, so a seed can never contain a rule violation.
 */
export function createScoreSheet(idPrefix: string, config: GameConfig) {
  const events: GameEvent[] = [];
  const snapshot = () => replay(events, config).snapshot;
  const nextId = () => `${idPrefix}-${events.length + 1}`;

  function record(event: GameEvent) {
    const { violations } = replay([...events, event], config);
    if (violations.length > 0) {
      throw new Error(
        `${event.id} breaks the rules: ${violations.map((violation) => violation.message).join("; ")}`
      );
    }
    events.push(event);
  }

  function play(code: string) {
    const current = snapshot();
    const baseRunningType = BASE_RUNNING_CODES[code];
    if (baseRunningType) {
      const movements = advanceMovements(
        current.runners,
        baseRunningType === "steal"
      );
      if (movements.length === 0)
        throw new Error(`${code}: no runner can advance`);
      record({
        id: nextId(),
        kind: "baseRunning",
        type: baseRunningType,
        movements,
      });
      return;
    }

    const match = /^([A-Z]+|[123]B)([1-9]?)$/.exec(code);
    const atBat = match && AT_BAT_CODES[match[1]];
    if (!match || !atBat) throw new Error(`Unknown play code "${code}"`);
    const side: TeamSide = current.half === "top" ? "away" : "home";
    const batterId =
      current.activeLineup[side][current.currentBatterIndex[side]];
    const battedBall: BattedBall | undefined =
      atBat.type && match[2]
        ? { position: POSITIONS[Number(match[2]) - 1], type: atBat.type }
        : undefined;
    record({
      id: nextId(),
      kind: "atBat",
      batterId,
      result: atBat.result,
      ...(battedBall ? { battedBall } : {}),
      movements: getDefaultMovements(
        atBat.result,
        current.runners,
        batterId,
        current.outs,
        { battedBall }
      ),
    });
  }

  function substitute(
    team: TeamSide,
    role: SubstitutionRole,
    outPlayerId: string,
    inPlayerId: string
  ) {
    record({
      id: nextId(),
      kind: "substitution",
      team,
      role,
      outPlayerId,
      inPlayerId,
    });
  }

  return {
    /** Space-separated scorebook codes, for example "1B7 SB K G6 F8". */
    plays(codes: string) {
      codes.split(/\s+/).filter(Boolean).forEach(play);
    },
    /** Replaces the batter who is due up. */
    pinchHit(inPlayerId: string) {
      const current = snapshot();
      const team: TeamSide = current.half === "top" ? "away" : "home";
      substitute(
        team,
        "pinchHitter",
        current.activeLineup[team][current.currentBatterIndex[team]],
        inPlayerId
      );
    },
    pinchRun(base: Base, inPlayerId: string) {
      const current = snapshot();
      const outPlayerId = current.runners[base];
      if (!outPlayerId) throw new Error(`pinchRun: no runner on ${base}`);
      substitute(
        current.half === "top" ? "away" : "home",
        "pinchRunner",
        outPlayerId,
        inPlayerId
      );
    },
    /** Replaces the pitcher of the team in the field. */
    changePitcher(inPlayerId: string) {
      const current = snapshot();
      const team: TeamSide = current.half === "top" ? "home" : "away";
      const outPlayerId = current.activePitcherId[team];
      if (!outPlayerId) throw new Error("changePitcher: no active pitcher");
      substitute(team, "pitcher", outPlayerId, inPlayerId);
    },
    note(text: string) {
      record({ id: nextId(), kind: "note", text });
    },
    endGame(reason: string) {
      record({ id: nextId(), kind: "gameControl", action: "endGame", reason });
    },
    events: (): GameEvent[] => [...events],
    snapshot,
  };
}
