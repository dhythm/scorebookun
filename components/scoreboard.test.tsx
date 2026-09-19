import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { gameReducer } from "@/lib/app-state/reducer";
import type { Team } from "@/lib/domain/types";
import { Scoreboard } from "./scoreboard";

const team = (side: string): Team => ({
  name: side,
  players: [{ id: `${side}-1`, name: `${side} 1`, order: 1 }],
});

const game = gameReducer(null, {
  type: "LOAD_GAME",
  game: {
    id: "scoreboard-game",
    date: "2026-07-26T00:00:00.000Z",
    status: "live",
    config: {
      regulationInnings: 7,
      teams: { away: team("away"), home: team("home") },
    },
    events: [],
  },
})!;

describe("Scoreboard", () => {
  it("keeps both team names and total scores available in a named summary", () => {
    const html = renderToStaticMarkup(
      <Scoreboard game={game} collapsibleOnMobile />
    );

    expect(html).toContain('aria-label="現在のスコア"');
    expect(html).toContain("先攻");
    expect(html).toContain("後攻");
    expect(html).toContain("イニングスコア");
  });

  it("starts with the compact mobile scoreboard when collapsible", () => {
    const html = renderToStaticMarkup(
      <Scoreboard game={game} collapsibleOnMobile />
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-scoreboard-view="compact"');
  });

  it("can opt into an initially expanded scoreboard", () => {
    const html = renderToStaticMarkup(
      <Scoreboard game={game} collapsibleOnMobile defaultMobileExpanded />
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-scoreboard-view="full"');
  });

  it("does not add a collapse control outside live scoring", () => {
    const html = renderToStaticMarkup(<Scoreboard game={game} />);

    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain('data-scoreboard-view="compact"');
  });
});
