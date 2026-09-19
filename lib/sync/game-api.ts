import type { GameConfig } from "@/lib/domain/types";

import { parseSharedGame, type SharedGame } from "./shared-game";

export type VersionedGame = { game: SharedGame; version: number };

type CreateGameResult =
  | ({ status: "created"; id: string } & VersionedGame)
  | { status: "unavailable" }
  | { status: "rejected" };

export type FetchGameResult =
  | ({ status: "found" } & VersionedGame)
  | { status: "unchanged" }
  | { status: "notFound" }
  | { status: "unavailable" };

export type SaveGameResult =
  | { status: "saved"; version: number }
  | ({ status: "conflict" } & VersionedGame)
  | { status: "notFound" }
  | { status: "unavailable" }
  | { status: "rejected" };

export type DeleteGameResult =
  | { status: "deleted" }
  | { status: "wrongKey" }
  /** The game was created without a delete key. */
  | { status: "noKey" }
  | { status: "notFound" }
  | { status: "unavailable" }
  | { status: "rejected" };

export type GameApi = {
  create(input: {
    date: string;
    config: GameConfig;
    /** Whoever knows it may delete the game later. */
    deleteKey?: string;
  }): Promise<CreateGameResult>;
  fetch(gameId: string, sinceVersion?: number): Promise<FetchGameResult>;
  save(input: {
    id: string;
    baseVersion: number;
    mutationId: string;
    game: SharedGame;
  }): Promise<SaveGameResult>;
  delete(gameId: string, deleteKey: string): Promise<DeleteGameResult>;
};

function gameUrl(gameId: string): string {
  return `/api/games/${encodeURIComponent(gameId)}`;
}

function parseVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error("Invalid version");
  }
  return value;
}

async function readVersionedGame(response: Response): Promise<VersionedGame> {
  const body = (await response.json()) as Record<string, unknown>;
  return {
    game: parseSharedGame(body.game),
    version: parseVersion(body.version),
  };
}

/**
 * Never throws: offline, server failures, and unreadable responses all become
 * "unavailable" so callers can keep the change on the device and retry.
 */
export function createGameApi(
  fetchFn: typeof fetch = (...args) => fetch(...args)
): GameApi {
  async function request<T extends { status: string }>(
    url: string,
    init: RequestInit | undefined,
    interpret: (response: Response) => Promise<T | null>
  ): Promise<T | { status: "unavailable" } | { status: "rejected" }> {
    try {
      const response = await fetchFn(url, { ...init, cache: "no-store" });
      const result = await interpret(response);
      if (result) return result;
      return response.status >= 400 && response.status < 500
        ? { status: "rejected" }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  }

  function jsonInit(method: string, body: unknown): RequestInit {
    return {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  return {
    create: (input) =>
      request<CreateGameResult>(
        "/api/games",
        jsonInit("POST", input),
        async (response) => {
          if (response.status !== 201) return null;
          const created = await readVersionedGame(response);
          return { status: "created", id: created.game.id, ...created };
        }
      ),

    fetch: async (gameId, sinceVersion) => {
      const query =
        sinceVersion === undefined ? "" : `?sinceVersion=${sinceVersion}`;
      const result = await request<FetchGameResult>(
        `${gameUrl(gameId)}${query}`,
        undefined,
        async (response) => {
          if (response.status === 204) return { status: "unchanged" };
          if (response.status === 404) return { status: "notFound" };
          if (response.status !== 200) return null;
          return { status: "found", ...(await readVersionedGame(response)) };
        }
      );
      return result.status === "rejected" ? { status: "unavailable" } : result;
    },

    save: (input) =>
      request<SaveGameResult>(
        gameUrl(input.id),
        jsonInit("PUT", {
          baseVersion: input.baseVersion,
          mutationId: input.mutationId,
          game: input.game,
        }),
        async (response) => {
          if (response.status === 404) return { status: "notFound" };
          if (response.status === 409) {
            return {
              status: "conflict",
              ...(await readVersionedGame(response)),
            };
          }
          if (response.status !== 200) return null;
          const body = (await response.json()) as Record<string, unknown>;
          return { status: "saved", version: parseVersion(body.version) };
        }
      ),

    // The key goes in the body: URLs end up in access logs.
    delete: (gameId, deleteKey) =>
      request<DeleteGameResult>(
        gameUrl(gameId),
        jsonInit("DELETE", { deleteKey }),
        async (response) => {
          if (response.status === 204) return { status: "deleted" };
          if (response.status === 404) return { status: "notFound" };
          if (response.status !== 403) return null;
          const body = (await response.json()) as Record<string, unknown>;
          return {
            status: body.error === "delete_key_not_set" ? "noKey" : "wrongKey",
          };
        }
      ),
  };
}
