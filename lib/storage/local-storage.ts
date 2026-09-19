import type {
  LegacyAtBatResult,
  LegacyGame,
  LegacyGameEvent,
} from "./legacy-v1-types";
import type {
  AtBatEvent,
  AtBatResult,
  BaseRunningEvent,
  BattedBall,
  FieldingPosition,
  GameConfig,
  GameEvent,
} from "../domain/types";

export const SCHEMA_VERSION = 2 as const;
export const DEFAULT_GAME_STORAGE_KEY = "baseball-scorer-game";
export const DEFAULT_GAME_HISTORY_STORAGE_KEY = "baseball-scorer-games";

export interface PersistedGameV2 {
  id: string;
  date: string;
  status: "setup" | "live" | "finished";
  config: GameConfig;
  events: GameEvent[];
  deletedEvents?: DeletedEvent[];
  undoHistory?: GameRevision[];
  redoHistory?: GameRevision[];
}

export interface DeletedEvent {
  event: GameEvent;
  index: number;
}

export interface GameRevision {
  events: GameEvent[];
  deletedEvents: DeletedEvent[];
  status: "live" | "finished";
}

export interface StorageEnvelopeV2 {
  schemaVersion: typeof SCHEMA_VERSION;
  game: PersistedGameV2;
}

interface GameHistoryEnvelopeV2 {
  schemaVersion: typeof SCHEMA_VERSION;
  games: PersistedGameV2[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface GameStorage {
  load(): PersistedGameV2 | null;
  save(game: PersistedGameV2): void;
  clear(): void;
}

export interface GameRepository {
  list(): PersistedGameV2[];
  find(id: string): PersistedGameV2 | null;
  save(game: PersistedGameV2): void;
  importGames(games: readonly PersistedGameV2[]): void;
  remove(id: string): void;
  loadActive(): PersistedGameV2 | null;
  clearActive(): void;
  clear(): void;
}

class StoredGameFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoredGameFormatError";
  }
}

const LEGACY_RESULT_MAP: Record<LegacyAtBatResult, AtBatResult> = {
  single: "single",
  double: "double",
  triple: "triple",
  homerun: "homerun",
  groundOut: "groundOut",
  flyOut: "flyOut",
  strikeout: "strikeout",
  strikeoutSwinging: "strikeoutSwinging",
  strikeoutLooking: "strikeoutLooking",
  uncaughtThirdStrike: "uncaughtThirdStrike",
  doublePlay: "doublePlay",
  otherOut: "otherOut",
  walk: "walk",
  hitByPitch: "hitByPitch",
  error: "error",
  sacrifice: "sacrifice",
  sacrificeFly: "sacrificeFly",
  fieldersChoice: "fieldersChoice",
  interference: "interference",
};

const POSITION_FROM_NOTATION: Record<string, FieldingPosition> = {
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

function migrateTeam(
  team: LegacyGame["teams"]["away"]
): GameConfig["teams"]["away"] {
  return {
    name: team.name,
    players: team.players.map((player) => ({
      id: player.id,
      name: player.name,
      order: player.order,
      ...(player.position == null ? {} : { position: player.position }),
    })),
    ...(team.benchPlayers === undefined
      ? {}
      : {
          benchPlayers: team.benchPlayers.map((player) => ({
            id: player.id,
            name: player.name,
            order: player.order,
            ...(player.position == null ? {} : { position: player.position }),
          })),
        }),
    ...(team.startingPitcherId === undefined
      ? {}
      : { startingPitcherId: team.startingPitcherId }),
    ...(team.startingPitcherName === undefined
      ? {}
      : { startingPitcherName: team.startingPitcherName }),
  };
}

function parseBattedBall(
  detail: string | undefined,
  result: AtBatResult
): BattedBall | undefined {
  const normalized = detail?.trim();
  if (!normalized) return undefined;
  const match = normalized.match(/^([投捕一二三遊左中右])/);
  if (!match) return undefined;
  const position = POSITION_FROM_NOTATION[match[1]];
  if (!position) return undefined;

  if (
    result === "groundOut" ||
    result === "doublePlay" ||
    result === "fieldersChoice" ||
    result === "error" ||
    result === "sacrifice" ||
    result === "otherOut"
  ) {
    return { position, type: normalized.includes("犠") ? "bunt" : "ground" };
  }
  if (result === "flyOut" || result === "sacrificeFly") {
    return { position, type: "fly" };
  }
  if (
    result === "single" ||
    result === "double" ||
    result === "triple" ||
    result === "homerun"
  ) {
    return {
      position,
      type:
        position === "pitcher" ||
        position === "catcher" ||
        position === "first" ||
        position === "second" ||
        position === "third" ||
        position === "short"
          ? "ground"
          : "liner",
    };
  }
  return undefined;
}

function migrateAtBatResult(event: LegacyGameEvent): AtBatResult {
  if (!event.result) {
    throw new StoredGameFormatError(
      `legacy at-bat event ${event.id} has no result`
    );
  }
  const detail = event.resultDetail?.trim() ?? "";
  if (
    event.result === "otherOut" &&
    (detail === "内野安" || /^[投捕一二三遊]安/.test(detail))
  ) {
    return "single";
  }
  if (event.result === "sacrifice" && detail.includes("犠飛")) {
    return "sacrificeFly";
  }
  return LEGACY_RESULT_MAP[event.result];
}

function migrateEvent(event: LegacyGameEvent): GameEvent {
  const movements = event.runnerMovements.map((movement) => ({ ...movement }));

  if (event.type === "baseRunning") {
    if (!event.baseRunningType) {
      throw new StoredGameFormatError(
        `legacy base-running event ${event.id} has no type`
      );
    }
    const migrated: BaseRunningEvent = {
      id: event.id,
      kind: "baseRunning",
      type: event.baseRunningType,
      movements,
      ...(event.rbiCreditBatterId
        ? { rbiCreditBatterId: event.rbiCreditBatterId }
        : {}),
    };
    return migrated;
  }

  if (!event.batterId) {
    throw new StoredGameFormatError(
      `legacy at-bat event ${event.id} has no batter`
    );
  }
  const result = migrateAtBatResult(event);
  const battedBall = parseBattedBall(event.resultDetail, result);
  const note = event.resultDetail?.trim();
  const migrated: AtBatEvent = {
    id: event.id,
    kind: "atBat",
    batterId: event.batterId,
    result,
    ...(battedBall ? { battedBall } : {}),
    ...(note ? { note } : {}),
    movements,
  };
  return migrated;
}

export function migrateV1Game(game: LegacyGame): PersistedGameV2 {
  return {
    id: game.id,
    date: game.date,
    status: game.status,
    config: {
      regulationInnings:
        Number.isInteger(game.totalInnings) && game.totalInnings > 0
          ? game.totalInnings
          : 9,
      teams: {
        away: migrateTeam(game.teams.away),
        home: migrateTeam(game.teams.home),
      },
    },
    events: game.events.map(migrateEvent),
  };
}

export function createStorageEnvelope(
  game: PersistedGameV2
): StorageEnvelopeV2 {
  return { schemaVersion: SCHEMA_VERSION, game };
}

export function serializeStoredGame(game: PersistedGameV2): string {
  return JSON.stringify(createStorageEnvelope(game));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isV2Envelope(value: unknown): value is StorageEnvelopeV2 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SCHEMA_VERSION ||
    !isPersistedGameV2(value.game)
  ) {
    return false;
  }
  return true;
}

function isPersistedGameV2(value: unknown): value is PersistedGameV2 {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.date !== "string" ||
    !["setup", "live", "finished"].includes(String(value.status)) ||
    !isRecord(value.config) ||
    typeof value.config.regulationInnings !== "number" ||
    !Number.isInteger(value.config.regulationInnings) ||
    value.config.regulationInnings < 1 ||
    !isRecord(value.config.teams) ||
    !isStoredTeam(value.config.teams.away) ||
    !isStoredTeam(value.config.teams.home) ||
    !Array.isArray(value.events) ||
    (value.deletedEvents !== undefined &&
      !isDeletedEventList(value.deletedEvents)) ||
    (value.undoHistory !== undefined &&
      !isGameRevisionList(value.undoHistory)) ||
    (value.redoHistory !== undefined && !isGameRevisionList(value.redoHistory))
  ) {
    return false;
  }
  return value.events.every(isStoredGameEvent);
}

function isStoredGameEvent(event: unknown): boolean {
  if (!isRecord(event) || typeof event.id !== "string") {
    return false;
  }
  if (event.kind === "atBat") {
    return (
      typeof event.batterId === "string" &&
      typeof event.result === "string" &&
      AT_BAT_RESULTS.has(event.result) &&
      isRunnerMovementList(event.movements) &&
      (event.note === undefined || typeof event.note === "string") &&
      (event.battedBall === undefined ||
        isStoredBattedBall(event.battedBall)) &&
      (event.fieldingSequence === undefined ||
        (Array.isArray(event.fieldingSequence) &&
          event.fieldingSequence.length > 0 &&
          event.fieldingSequence.every(
            (position) =>
              typeof position === "string" && FIELDING_POSITIONS.has(position)
          )))
    );
  }
  if (event.kind === "baseRunning") {
    return (
      typeof event.type === "string" &&
      BASE_RUNNING_TYPES.has(event.type) &&
      isRunnerMovementList(event.movements) &&
      (event.rbiCreditBatterId === undefined ||
        typeof event.rbiCreditBatterId === "string")
    );
  }
  if (event.kind === "substitution") {
    return (
      ["away", "home"].includes(String(event.team)) &&
      typeof event.inPlayerId === "string" &&
      typeof event.outPlayerId === "string" &&
      ["pinchHitter", "pinchRunner", "fielder", "pitcher"].includes(
        String(event.role)
      ) &&
      (event.position === undefined || isFieldingPosition(event.position))
    );
  }
  if (event.kind === "positionChange") {
    return (
      ["away", "home"].includes(String(event.team)) &&
      Array.isArray(event.changes) &&
      event.changes.every(
        (change) =>
          isRecord(change) &&
          typeof change.playerId === "string" &&
          isFieldingPosition(change.position)
      )
    );
  }
  if (event.kind === "runnerPlacement") {
    const runners = event.runners;
    return (
      isRecord(runners) &&
      (["first", "second", "third"] as const).every(
        (base) => runners[base] === null || typeof runners[base] === "string"
      )
    );
  }
  if (event.kind === "note") {
    return typeof event.text === "string";
  }
  return (
    event.kind === "gameControl" &&
    event.action === "endGame" &&
    (event.reason === undefined || typeof event.reason === "string")
  );
}

function isDeletedEventList(value: unknown): value is DeletedEvent[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        Number.isInteger(item.index) &&
        Number(item.index) >= 0 &&
        isStoredGameEvent(item.event)
    )
  );
}

function isGameRevisionList(value: unknown): value is GameRevision[] {
  return (
    Array.isArray(value) &&
    value.length <= 20 &&
    value.every(
      (revision) =>
        isRecord(revision) &&
        ["live", "finished"].includes(String(revision.status)) &&
        Array.isArray(revision.events) &&
        revision.events.every(isStoredGameEvent) &&
        isDeletedEventList(revision.deletedEvents)
    )
  );
}

const FIELDING_POSITIONS = new Set([
  "pitcher",
  "catcher",
  "first",
  "second",
  "third",
  "short",
  "left",
  "center",
  "right",
  "dh",
]);

function isFieldingPosition(value: unknown): boolean {
  return typeof value === "string" && FIELDING_POSITIONS.has(value);
}

const AT_BAT_RESULTS = new Set([
  "single",
  "double",
  "triple",
  "homerun",
  "groundOut",
  "flyOut",
  "strikeout",
  "strikeoutSwinging",
  "strikeoutLooking",
  "doublePlay",
  "otherOut",
  "walk",
  "hitByPitch",
  "error",
  "sacrifice",
  "sacrificeFly",
  "fieldersChoice",
  "interference",
  "uncaughtThirdStrike",
]);

const BASE_RUNNING_TYPES = new Set([
  "steal",
  "caughtStealing",
  "wildPitch",
  "passedBall",
  "pickOff",
  "balk",
  "otherAdvance",
  "otherOut",
]);

const RUNNER_ORIGINS = new Set(["batter", "first", "second", "third"]);
const RUNNER_DESTINATIONS = new Set([
  "first",
  "second",
  "third",
  "home",
  "out",
]);

function isRunnerMovementList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (movement) =>
        isRecord(movement) &&
        typeof movement.playerId === "string" &&
        typeof movement.from === "string" &&
        RUNNER_ORIGINS.has(movement.from) &&
        typeof movement.to === "string" &&
        RUNNER_DESTINATIONS.has(movement.to) &&
        typeof movement.isRBI === "boolean" &&
        (movement.playOrder === undefined ||
          (Number.isInteger(movement.playOrder) &&
            Number(movement.playOrder) > 0)) &&
        (movement.outType === undefined ||
          (movement.to === "out" &&
            ["force", "tag"].includes(String(movement.outType))))
    )
  );
}

function isStoredBattedBall(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.position === "string" &&
    FIELDING_POSITIONS.has(value.position) &&
    ["ground", "fly", "liner", "bunt"].includes(String(value.type)) &&
    (value.depth === undefined ||
      value.depth === "shallow" ||
      value.depth === "deep")
  );
}

function isStoredPlayer(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.order === "number" &&
    Number.isInteger(value.order) &&
    value.order > 0 &&
    (value.position === undefined ||
      value.position === null ||
      (typeof value.position === "string" &&
        FIELDING_POSITIONS.has(value.position)))
  );
}

function isStoredTeam(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    Array.isArray(value.players) &&
    value.players.every(isStoredPlayer) &&
    (value.benchPlayers === undefined ||
      (Array.isArray(value.benchPlayers) &&
        value.benchPlayers.every(isStoredPlayer))) &&
    (value.startingPitcherId === undefined ||
      value.startingPitcherId === null ||
      typeof value.startingPitcherId === "string") &&
    (value.startingPitcherName === undefined ||
      typeof value.startingPitcherName === "string")
  );
}

function isLegacyGame(value: unknown): value is LegacyGame {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.totalInnings === "number" &&
    isRecord(value.teams) &&
    Array.isArray(value.events)
  );
}

export function parseStoredGame(serialized: string): PersistedGameV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new StoredGameFormatError("stored game is not valid JSON");
  }

  if (isV2Envelope(parsed)) return parsed.game;
  if (isLegacyGame(parsed)) return migrateV1Game(parsed);

  if (isRecord(parsed) && "schemaVersion" in parsed) {
    if (parsed.schemaVersion === SCHEMA_VERSION) {
      throw new StoredGameFormatError("malformed schema version 2 game");
    }
    throw new StoredGameFormatError(
      `unsupported schema version: ${String(parsed.schemaVersion)}`
    );
  }
  throw new StoredGameFormatError("stored value is not a supported game");
}

export function createGameStorage(
  storage: StorageLike,
  key = DEFAULT_GAME_STORAGE_KEY
): GameStorage {
  return {
    load() {
      const serialized = storage.getItem(key);
      if (serialized === null) return null;
      try {
        return parseStoredGame(serialized);
      } catch {
        storage.removeItem(key);
        return null;
      }
    },
    save(game) {
      storage.setItem(key, serializeStoredGame(game));
    },
    clear() {
      storage.removeItem(key);
    },
  };
}

function serializeGameHistory(games: PersistedGameV2[]): string {
  const envelope: GameHistoryEnvelopeV2 = {
    schemaVersion: SCHEMA_VERSION,
    games,
  };
  return JSON.stringify(envelope);
}

function parseGameHistory(serialized: string): PersistedGameV2[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new StoredGameFormatError("stored game history is not valid JSON");
  }

  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(parsed.games) ||
    !parsed.games.every(isPersistedGameV2)
  ) {
    throw new StoredGameFormatError("malformed game history");
  }
  return parsed.games;
}

function newestFirst(games: readonly PersistedGameV2[]): PersistedGameV2[] {
  return [...games].sort(
    (left, right) =>
      right.date.localeCompare(left.date) || right.id.localeCompare(left.id)
  );
}

export function createGameRepository(
  storage: StorageLike,
  historyKey = DEFAULT_GAME_HISTORY_STORAGE_KEY,
  activeKey = DEFAULT_GAME_STORAGE_KEY
): GameRepository {
  const activeStorage = createGameStorage(storage, activeKey);

  function loadHistory(): PersistedGameV2[] {
    const serialized = storage.getItem(historyKey);
    if (serialized === null) return [];
    try {
      return parseGameHistory(serialized);
    } catch {
      storage.removeItem(historyKey);
      return [];
    }
  }

  function list(): PersistedGameV2[] {
    const gamesById = new Map(
      loadHistory().map((game) => [game.id, game] as const)
    );
    const activeGame = activeStorage.load();
    if (activeGame) gamesById.set(activeGame.id, activeGame);
    return newestFirst([...gamesById.values()]);
  }

  return {
    list,
    find(id) {
      return list().find((game) => game.id === id) ?? null;
    },
    save(game) {
      const gamesById = new Map(
        list().map((storedGame) => [storedGame.id, storedGame] as const)
      );
      gamesById.set(game.id, game);
      activeStorage.save(game);
      storage.setItem(
        historyKey,
        serializeGameHistory(newestFirst([...gamesById.values()]))
      );
    },
    importGames(games) {
      const gamesById = new Map(
        list().map((storedGame) => [storedGame.id, storedGame] as const)
      );
      for (const game of games) gamesById.set(game.id, game);
      storage.setItem(
        historyKey,
        serializeGameHistory(newestFirst([...gamesById.values()]))
      );
    },
    remove(id) {
      const activeGame = activeStorage.load();
      const remainingGames = list().filter((game) => game.id !== id);
      storage.setItem(historyKey, serializeGameHistory(remainingGames));
      if (activeGame?.id === id) activeStorage.clear();
    },
    loadActive() {
      return activeStorage.load();
    },
    clearActive() {
      activeStorage.clear();
    },
    clear() {
      storage.removeItem(historyKey);
      activeStorage.clear();
    },
  };
}

export function createBrowserGameRepository(
  historyKey = DEFAULT_GAME_HISTORY_STORAGE_KEY,
  activeKey = DEFAULT_GAME_STORAGE_KEY
): GameRepository {
  if (typeof window === "undefined") {
    throw new Error("localStorage is unavailable outside the browser");
  }
  return createGameRepository(window.localStorage, historyKey, activeKey);
}
