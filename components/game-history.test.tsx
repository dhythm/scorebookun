// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBrowserGameRepository,
  type PersistedGameV2,
} from "@/lib/storage/local-storage";
import { createBrowserSyncMetaStore } from "@/lib/storage/sync-meta";
import type { DeleteGameResult } from "@/lib/sync/game-api";

import { GameHistory } from "./game-history";

const { deleteGame } = vi.hoisted(() => ({
  deleteGame:
    vi.fn<(gameId: string, deleteKey: string) => Promise<DeleteGameResult>>(),
}));

vi.mock("@/lib/game-context", () => ({
  useGame: () => ({
    game: null,
    resetGame: vi.fn(),
    importGames: vi.fn(),
    deleteGame,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const stored: PersistedGameV2 = {
  id: "stored-game",
  date: "2026-07-27T00:00:00.000Z",
  status: "live",
  config: {
    regulationInnings: 7,
    teams: {
      away: {
        name: "Away",
        players: [{ id: "away-1", name: "Away 1", order: 1 }],
      },
      home: {
        name: "Home",
        players: [{ id: "home-1", name: "Home 1", order: 1 }],
      },
    },
  },
  events: [],
};

async function openDeleteDialog() {
  const user = userEvent.setup();
  render(<GameHistory />);
  await user.click(screen.getByRole("button", { name: /試合履歴/ }));
  await user.click(
    screen.getByRole("button", { name: "Away対Homeの試合を履歴から削除" })
  );
  return user;
}

const isListed = () => createBrowserGameRepository().find(stored.id) !== null;

describe("deleting from the game history", () => {
  beforeEach(() => {
    window.localStorage.clear();
    createBrowserGameRepository().save(stored);
    createBrowserSyncMetaStore().set(stored.id, {
      baseVersion: 1,
      dirty: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("only forgets the game on this device when no key is entered", async () => {
    const user = await openDeleteDialog();

    await user.click(screen.getByRole("button", { name: "履歴から外す" }));

    expect(deleteGame).not.toHaveBeenCalled();
    expect(isListed()).toBe(false);
  });

  it("deletes the game from the server with the key", async () => {
    deleteGame.mockResolvedValue({ status: "deleted" });
    const user = await openDeleteDialog();

    await user.type(screen.getByLabelText("削除キー"), "open sesame");
    await user.click(
      screen.getByRole("button", { name: "サーバーからも削除" })
    );

    await waitFor(() =>
      expect(deleteGame).toHaveBeenCalledWith(stored.id, "open sesame")
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it.each([
    ["wrongKey", "削除キーが違います。"],
    ["noKey", "この試合には削除キーが設定されていないため、削除できません。"],
    ["unavailable", "削除できませんでした。通信環境を確認してください。"],
  ] as const)(
    "keeps the game and explains a %s reply",
    async (status, text) => {
      deleteGame.mockResolvedValue({ status });
      const user = await openDeleteDialog();

      await user.type(screen.getByLabelText("削除キー"), "open barley");
      await user.click(
        screen.getByRole("button", { name: "サーバーからも削除" })
      );

      expect(await screen.findByText(text)).toBeTruthy();
      expect(screen.getByRole("alertdialog")).toBeTruthy();
      expect(isListed()).toBe(true);
    }
  );
});
