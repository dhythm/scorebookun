// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gameReducer } from "@/lib/app-state/reducer";
import type { AppGame } from "@/lib/app-state/types";
import type { Team } from "@/lib/domain/types";
import { BattingOrderPanel } from "./batting-order";

vi.mock("./at-bat-result-dialog", () => ({ AtBatResultDialog: () => null }));
vi.mock("./base-running-edit-dialog", () => ({
  BaseRunningEditDialog: () => null,
}));

const team = (side: string): Team => ({
  name: side,
  players: Array.from({ length: 9 }, (_, index) => ({
    id: `${side}-${index + 1}`,
    name: `${side} ${index + 1}`,
    order: index + 1,
  })),
});

function createGame(): AppGame {
  const game = gameReducer(null, {
    type: "LOAD_GAME",
    game: {
      id: "batting-order-game",
      date: "2026-09-19T00:00:00.000Z",
      status: "live",
      config: {
        regulationInnings: 9,
        teams: { away: team("away"), home: team("home") },
      },
      events: [],
    },
  })!;
  return {
    ...game,
    currentState: {
      ...game.currentState,
      inning: 7,
      currentBatterIndex: { away: 8, home: 0 },
    },
  };
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockClear();
  vi.stubGlobal("innerHeight", 667);
  vi.stubGlobal("scrollY", 420);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top: 900,
    bottom: 950,
  } as DOMRect);
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    { top: 900, bottom: 950 },
  ] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(343);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(616);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(56);
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
    function (this: HTMLElement) {
      return 112 + (Number(this.dataset.inningColumn) - 1) * 56;
    }
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BattingOrderPanel scrolling", () => {
  it("keeps the page position when the current batter starts below the viewport", () => {
    render(<BattingOrderPanel game={createGame()} />);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(420);
    expect(screen.getAllByLabelText("awayの打順").at(-1)!.scrollLeft).toBe(249);
  });

  it("preserves manual horizontal browsing when recording the next batter", () => {
    const game = createGame();
    const { rerender } = render(<BattingOrderPanel game={game} />);
    const table = screen.getAllByLabelText("awayの打順").at(-1)!;
    table.scrollLeft = 80;
    scrollIntoView.mockClear();

    rerender(
      <BattingOrderPanel
        game={{
          ...game,
          currentState: {
            ...game.currentState,
            currentBatterIndex: { away: 0, home: 0 },
          },
        }}
      />
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(table.scrollLeft).toBe(80);
    expect(window.scrollY).toBe(420);
  });

  it("does not move the page when switching team tabs", async () => {
    const user = userEvent.setup();
    render(<BattingOrderPanel game={createGame()} />);
    scrollIntoView.mockClear();

    await user.click(screen.getByRole("tab", { name: "home" }));
    await user.click(screen.getByRole("tab", { name: "away" }));

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(420);
  });

  it("follows the current inning horizontally when the inning changes", () => {
    const game = createGame();
    const { rerender } = render(<BattingOrderPanel game={game} />);
    const table = screen.getAllByLabelText("awayの打順").at(-1)!;
    table.scrollLeft = 80;

    rerender(
      <BattingOrderPanel
        game={{
          ...game,
          currentState: { ...game.currentState, inning: 8 },
        }}
      />
    );

    expect(table.scrollLeft).toBe(273);
  });
});
