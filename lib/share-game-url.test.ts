import { describe, expect, it, vi } from "vitest";

import { shareGameUrl } from "./share-game-url";

const content = {
  title: "Away 対 Home",
  url: "https://example.test/games/abc",
};

describe("shareGameUrl", () => {
  it("uses the native share sheet when available", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);

    await expect(shareGameUrl(content, { share, writeText })).resolves.toBe(
      "shared"
    );
    expect(share).toHaveBeenCalledWith(content);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("treats a dismissed share sheet as cancelled, not as a failure", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("dismissed", "AbortError");
    });

    await expect(shareGameUrl(content, { share })).resolves.toBe("cancelled");
  });

  it("copies the URL when sharing is unavailable or fails", async () => {
    const writeText = vi.fn(async () => undefined);
    const share = vi.fn(async () => {
      throw new DOMException("denied", "NotAllowedError");
    });

    await expect(shareGameUrl(content, { writeText })).resolves.toBe("copied");
    await expect(shareGameUrl(content, { share, writeText })).resolves.toBe(
      "copied"
    );
    expect(writeText).toHaveBeenCalledWith(content.url);
  });

  it("reports failure when nothing works", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("blocked");
    });

    await expect(shareGameUrl(content, { writeText })).resolves.toBe("failed");
    await expect(shareGameUrl(content, {})).resolves.toBe("failed");
  });
});
