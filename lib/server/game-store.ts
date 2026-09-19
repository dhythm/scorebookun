import { randomBytes } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { games } from "@/lib/db/schema";
import type { GameConfig } from "@/lib/domain/types";
import type { SharedGame } from "@/lib/sync/shared-game";

type Db = Database["db"];

export type VersionedGame = { game: SharedGame; version: number };

export type SaveGameResult =
  | { status: "saved"; version: number }
  | ({ status: "conflict" } & VersionedGame)
  | { status: "notFound" };

function generateGameId(): string {
  return randomBytes(16).toString("base64url");
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
  await db.insert(games).values({ id, payload: game });
  return { id, game, version: 1 };
}

export async function findGame(
  db: Db,
  id: string
): Promise<VersionedGame | null> {
  const [row] = await db
    .select({ game: games.payload, version: games.version })
    .from(games)
    .where(eq(games.id, id));
  return row ?? null;
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
  // The version check and the write are one statement, so two concurrent
  // writers cannot both succeed from the same base version.
  const [saved] = await db
    .update(games)
    .set({
      payload: input.game,
      version: sql`${games.version} + 1`,
      lastMutationId: input.mutationId,
    })
    .where(and(eq(games.id, input.id), eq(games.version, input.baseVersion)))
    .returning({ version: games.version });
  if (saved) return { status: "saved", version: saved.version };

  const [current] = await db
    .select({
      game: games.payload,
      version: games.version,
      lastMutationId: games.lastMutationId,
    })
    .from(games)
    .where(eq(games.id, input.id));
  if (!current) return { status: "notFound" };
  if (current.lastMutationId === input.mutationId) {
    return { status: "saved", version: current.version };
  }
  return { status: "conflict", game: current.game, version: current.version };
}
