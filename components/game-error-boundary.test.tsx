// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBrowserGameRepository,
  type PersistedGameV2,
} from "@/lib/storage/local-storage";
import { GameErrorBoundary } from "./game-error-boundary";

const game: PersistedGameV2 = {
  id: "saved-game",
  date: "2026-07-27T00:00:00.000Z",
  status: "live",
  config: {
    regulationInnings: 7,
    teams: {
      away: { name: "Away", players: [] },
      home: { name: "Home", players: [] },
    },
  },
  events: [],
};

function BrokenScreen(): never {
  throw new Error("render failed");
}

describe("GameErrorBoundary", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows a recovery screen when a child render fails", () => {
    render(
      <GameErrorBoundary>
        <BrokenScreen />
      </GameErrorBoundary>
    );

    expect(
      screen.getByText("最後に保存できた時点までの記録をエクスポートできます")
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "記録をエクスポート",
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeTruthy();
  });

  it("downloads the latest active game as JSON", async () => {
    const user = userEvent.setup();
    createBrowserGameRepository().save(game);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:game");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    render(
      <GameErrorBoundary>
        <BrokenScreen />
      </GameErrorBoundary>
    );
    await user.click(
      screen.getByRole("button", { name: "記録をエクスポート" })
    );

    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: "application/json" })
    );
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:game");
  });
});
