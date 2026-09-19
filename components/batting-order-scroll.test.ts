import { describe, expect, it } from "vitest";

import { getInningColumnScrollLeft } from "./batting-order-scroll";

describe("getInningColumnScrollLeft", () => {
  it("keeps an early inning at the start of the table", () => {
    expect(
      getInningColumnScrollLeft({
        containerWidth: 343,
        stickyWidth: 112,
        targetOffsetLeft: 112,
        targetWidth: 56,
        maxScrollLeft: 273,
      })
    ).toBe(0);
  });

  it("centers a later inning in the area beside the sticky columns", () => {
    expect(
      getInningColumnScrollLeft({
        containerWidth: 343,
        stickyWidth: 112,
        targetOffsetLeft: 392,
        targetWidth: 56,
        maxScrollLeft: 600,
      })
    ).toBe(193);
  });

  it("does not scroll beyond the end of the table", () => {
    expect(
      getInningColumnScrollLeft({
        containerWidth: 343,
        stickyWidth: 112,
        targetOffsetLeft: 840,
        targetWidth: 56,
        maxScrollLeft: 420,
      })
    ).toBe(420);
  });
});
