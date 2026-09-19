// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PersistedGameV2 } from "@/lib/storage/local-storage";
import { HistoryBackupNotice } from "./history-backup-notice";

function game(id: string): PersistedGameV2 {
  return {
    id,
    date: "2026-07-27",
    status: "finished",
    config: {
      regulationInnings: 1,
      teams: {
        away: { name: "Away", players: [] },
        home: { name: "Home", players: [] },
      },
    },
    events: [],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HistoryBackupNotice", () => {
  it("requires an explicit archive download before removal", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:history"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    render(
      <HistoryBackupNotice
        games={[game("old-one"), game("old-two")]}
        onRemove={onRemove}
      />
    );

    expect(
      screen.queryByRole("button", { name: "エクスポート済みの履歴を削除" })
    ).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "2試合をエクスポート" })
    );

    expect(click).toHaveBeenCalledOnce();
    await user.click(
      screen.getByRole("button", { name: "エクスポート済みの履歴を削除" })
    );
    expect(
      screen.getByText((text) =>
        text.includes("エクスポートした2試合を履歴から削除します。")
      )
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "履歴から削除" }));

    expect(onRemove).toHaveBeenCalledWith(["old-one", "old-two"]);
  });
});
