import { describe, expect, it } from "vitest";

import { redactGameUrl } from "./redact-game-url";

describe("redactGameUrl", () => {
  it("hides the game id, which is what grants access to a game", () => {
    expect(
      redactGameUrl("https://example.test/games/d0Z1ivxAvSYLhoqYN2avGQ?x=1#top")
    ).toBe("https://example.test/games/[gameId]");
  });

  it("leaves other URLs untouched", () => {
    expect(redactGameUrl("https://example.test/")).toBe(
      "https://example.test/"
    );
    expect(redactGameUrl("not a url")).toBe("not a url");
  });
});
