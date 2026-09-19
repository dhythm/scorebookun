import { randomBytes } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  eventRunnerMovements,
  gameEvents,
  gamePlayers,
  games,
  gameTeams,
} from "@/lib/db/schema";
import type { GameConfig } from "@/lib/domain/types";
import type { SharedGame } from "@/lib/sync/shared-game";

import { fromGameRows, toGameRows, type GameRows } from "./game-rows";

type Db = Database["db"];
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type VersionedGame = { game: SharedGame; version: number };

export type SaveGameResult =
  | { status: "saved"; version: number }
  | ({ status: "conflict" } & VersionedGame)
  | { status: "notFound" };

function generateGameId(): string {
  return randomBytes(16).toString("base64url");
}

/** Replaces everything recorded under the game row. */
async function replaceChildRows(
  transaction: Transaction,
  rows: GameRows
): Promise<void> {
  const gameId = rows.game.id;
  // Deleting events also deletes their runner movements.
  await transaction.delete(gameEvents).where(eq(gameEvents.gameId, gameId));
  await transaction.delete(gamePlayers).where(eq(gamePlayers.gameId, gameId));
  await transaction.delete(gameTeams).where(eq(gameTeams.gameId, gameId));

  await transaction.insert(gameTeams).values(rows.teams);
  if (rows.players.length > 0) {
    await transaction.insert(gamePlayers).values(rows.players);
  }
  if (rows.events.length > 0) {
    await transaction.insert(gameEvents).values(rows.events);
  }
  if (rows.movements.length > 0) {
    await transaction.insert(eventRunnerMovements).values(rows.movements);
  }
}

/** Inserts a game at version 1, replacing any game with the same id. */
export async function insertGame(db: Db, game: SharedGame): Promise<void> {
  const rows = toGameRows(game);
  await db.transaction(async (transaction) => {
    await transaction.delete(games).where(eq(games.id, game.id));
    await transaction.insert(games).values(rows.game);
    await replaceChildRows(transaction, rows);
  });
}

export async function createGame(
  db: Db,
  input: { date: string; config: GameConfig }
): Promise<VersionedGame & { id: string }> {
  const id = generateGameId();
  const game: SharedGame = {
    id,
    date: input.date,
    status: "live",
    config: input.config,
    events: [],
  };
  await insertGame(db, game);
  return { id, game: fromGameRows(toGameRows(game)), version: 1 };
}

async function readGame(
  db: Db,
  id: string
): Promise<(VersionedGame & { lastMutationId: string | null }) | null> {
  const [game] = await db.select().from(games).where(eq(games.id, id));
  if (!game) return null;
  const [teams, players, events, movements] = await Promise.all([
    db.select().from(gameTeams).where(eq(gameTeams.gameId, id)),
    db.select().from(gamePlayers).where(eq(gamePlayers.gameId, id)),
    db.select().from(gameEvents).where(eq(gameEvents.gameId, id)),
    db
      .select()
      .from(eventRunnerMovements)
      .where(eq(eventRunnerMovements.gameId, id)),
  ]);
  return {
    game: fromGameRows({ game, teams, players, events, movements }),
    version: game.version,
    lastMutationId: game.lastMutationId,
  };
}

export async function findGame(
  db: Db,
  id: string
): Promise<VersionedGame | null> {
  const found = await readGame(db, id);
  return found && { game: found.game, version: found.version };
}

export async function saveGame(
  db: Db,
  input: {
    id: string;
    baseVersion: number;
    mutationId: string;
    game: SharedGame;
  }
): Promise<SaveGameResult> {
  const rows = toGameRows(input.game);
  const savedVersion = await db.transaction(async (transaction) => {
    // The version check and the bump are one statement, so two concurrent
    // writers cannot both succeed from the same base version. The row lock it
    // takes also serializes the child-row replacement below.
    const [saved] = await transaction
      .update(games)
      .set({
        status: rows.game.status,
        startedAt: rows.game.startedAt,
        regulationInnings: rows.game.regulationInnings,
        version: sql`${games.version} + 1`,
        lastMutationId: input.mutationId,
      })
      .where(and(eq(games.id, input.id), eq(games.version, input.baseVersion)))
      .returning({ version: games.version });
    if (!saved) return null;
    await replaceChildRows(transaction, rows);
    return saved.version;
  });
  if (savedVersion !== null) return { status: "saved", version: savedVersion };

  const current = await readGame(db, input.id);
  if (!current) return { status: "notFound" };
  if (current.lastMutationId === input.mutationId) {
    return { status: "saved", version: current.version };
  }
  return { status: "conflict", game: current.game, version: current.version };
}
