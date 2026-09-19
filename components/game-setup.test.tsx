// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GameSetup } from "./game-setup";

const { createGame, push } = vi.hoisted(() => ({
  createGame: vi.fn(async () => "created-game"),
  push: vi.fn(),
}));

vi.mock("@/lib/game-context", () => ({
  useGame: () => ({ createGame }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./game-history", () => ({ GameHistory: () => null }));
vi.mock("./display-settings-dialog", () => ({
  DisplaySettingsDialog: () => null,
}));
vi.mock("./feedback-dialog", () => ({ FeedbackDialog: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("custom regulation innings", () => {
  it("rejects fractions and out-of-range values before creating a game", async () => {
    const user = userEvent.setup();
    render(<GameSetup />);
    await user.click(
      screen.getByRole("button", { name: "チーム1・チーム2（各9人）を設定" })
    );
    await user.click(screen.getByRole("button", { name: "任意" }));
    const input = screen.getByLabelText("イニング数（1〜20）");
    const start = screen.getByRole<HTMLButtonElement>("button", {
      name: "試合を作成して開始",
    });

    for (const value of ["1.5", "20.5", "0", "21", ""]) {
      fireEvent.change(input, { target: { value } });
      expect(start.disabled, `invalid innings: ${value}`).toBe(true);
      expect(screen.getByText("1〜20の整数を入力してください。")).toBeTruthy();
      await user.click(start);
      expect(createGame).not.toHaveBeenCalled();
    }

    for (const value of ["1", "20", "6"]) {
      fireEvent.change(input, { target: { value } });
      expect(start.disabled, `valid innings: ${value}`).toBe(false);
    }
    await user.click(start);
    expect(createGame).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ regulationInnings: 6 }),
      })
    );
    expect(push).toHaveBeenCalledWith("/games/created-game");
  });
});
