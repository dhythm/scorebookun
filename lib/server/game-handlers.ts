import type { Database } from "@/lib/db/client";
import { parseDeleteKey } from "@/lib/sync/delete-key";
import { parseSharedGame, type SharedGame } from "@/lib/sync/shared-game";

import { hashDeleteKey, verifyDeleteKey } from "./delete-key";
import {
  createGame,
  deleteGame,
  findDeleteKeyHash,
  findGame,
  saveGame,
} from "./game-store";

type Db = Database["db"];

const MAX_BODY_LENGTH = 1_000_000;
const MAX_MUTATION_ID_LENGTH = 100;

class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** The database could not be reached; clients treat this as retryable. */
export function unavailable(): Response {
  return json(503, { error: "unavailable" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(
  request: Request
): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_LENGTH) {
    throw new RequestError(413, "payload_too_large");
  }
  try {
    const body: unknown = JSON.parse(text);
    if (isRecord(body)) return body;
  } catch {
    // Reported as an invalid request below.
  }
  throw new RequestError(400, "invalid_request");
}

function hasDuplicates(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/**
 * True when the database would refuse the game. The domain reports duplicate
 * ids as violations, but rows are keyed by them, so they are refused here
 * with a 400 instead of failing later as a constraint error.
 */
function isUnstorable(game: SharedGame): boolean {
  const { away, home } = game.config.teams;
  const playerIds = [away, home].flatMap((team) =>
    [...team.players, ...(team.benchPlayers ?? [])].map((player) => player.id)
  );
  const eventIds = [
    ...game.events,
    ...(game.deletedEvents ?? []).map((deleted) => deleted.event),
  ].map((event) => event.id);
  return (
    Number.isNaN(new Date(game.date).getTime()) ||
    hasDuplicates(playerIds) ||
    hasDuplicates(eventIds)
  );
}

function parseGame(value: unknown): SharedGame {
  let game: SharedGame;
  try {
    game = parseSharedGame(value);
  } catch {
    throw new RequestError(400, "invalid_request");
  }
  if (isUnstorable(game)) throw new RequestError(400, "invalid_request");
  return game;
}

// Responses carry error codes only, so database details never reach clients.
async function respond(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof RequestError) {
      return json(error.status, { error: error.code });
    }
    console.error(
      "Game request failed:",
      // First line only: driver errors append the query parameters, which
      // hold what users typed.
      error instanceof Error
        ? error.message.split("\n")[0].slice(0, 200)
        : "unknown error"
    );
    return json(500, { error: "internal_error" });
  }
}

export function handleCreateGame(db: Db, request: Request): Promise<Response> {
  return respond(async () => {
    const body = await readJsonBody(request);
    const draft = parseGame({
      id: "draft",
      date: body.date,
      status: "live",
      config: body.config,
      events: [],
    });
    // The key travels beside the game, never inside it: the game is what
    // every holder of the URL receives.
    const deleteKey = parseDeleteKey(body.deleteKey);
    if (!deleteKey.ok) throw new RequestError(400, "invalid_request");
    const created = await createGame(db, {
      date: draft.date,
      config: draft.config,
      deleteKeyHash: deleteKey.key && (await hashDeleteKey(deleteKey.key)),
    });
    return json(201, created);
  });
}

export function handleDeleteGame(
  db: Db,
  gameId: string,
  request: Request
): Promise<Response> {
  return respond(async () => {
    const body = await readJsonBody(request);
    const deleteKey = parseDeleteKey(body.deleteKey);
    if (!deleteKey.ok || deleteKey.key === null) {
      throw new RequestError(400, "invalid_request");
    }

    const stored = await findDeleteKeyHash(db, gameId);
    if (stored === undefined) return json(404, { error: "not_found" });
    if (stored === null) throw new RequestError(403, "delete_key_not_set");
    if (!(await verifyDeleteKey(deleteKey.key, stored))) {
      throw new RequestError(403, "delete_key_mismatch");
    }

    await deleteGame(db, gameId);
    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store" },
    });
  });
}

export function handleGetGame(
  db: Db,
  gameId: string,
  request: Request
): Promise<Response> {
  return respond(async () => {
    const found = await findGame(db, gameId);
    if (!found) return json(404, { error: "not_found" });

    const sinceVersion = Number(
      new URL(request.url).searchParams.get("sinceVersion")
    );
    if (found.version === sinceVersion) {
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store" },
      });
    }
    return json(200, found);
  });
}

export function handleSaveGame(
  db: Db,
  gameId: string,
  request: Request
): Promise<Response> {
  return respond(async () => {
    const body = await readJsonBody(request);
    const { baseVersion, mutationId } = body;
    if (
      typeof baseVersion !== "number" ||
      !Number.isSafeInteger(baseVersion) ||
      typeof mutationId !== "string" ||
      mutationId.length === 0 ||
      mutationId.length > MAX_MUTATION_ID_LENGTH
    ) {
      throw new RequestError(400, "invalid_request");
    }
    const game = parseGame(body.game);
    if (game.id !== gameId) throw new RequestError(400, "invalid_request");

    const result = await saveGame(db, {
      id: gameId,
      baseVersion,
      mutationId,
      game,
    });
    switch (result.status) {
      case "saved":
        return json(200, { version: result.version });
      case "conflict":
        return json(409, {
          error: "version_conflict",
          game: result.game,
          version: result.version,
        });
      case "notFound":
        return json(404, { error: "not_found" });
    }
  });
}
