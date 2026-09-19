import { describe, expect, it } from "vitest";

import { parseDeleteKey } from "./delete-key";

describe("parseDeleteKey", () => {
  it("treats a missing or blank key as no key", () => {
    expect(parseDeleteKey(undefined)).toEqual({ ok: true, key: null });
    expect(parseDeleteKey(null)).toEqual({ ok: true, key: null });
    expect(parseDeleteKey("   ")).toEqual({ ok: true, key: null });
  });

  it("trims surrounding whitespace", () => {
    expect(parseDeleteKey("  abcd ")).toEqual({ ok: true, key: "abcd" });
  });

  it.each([
    ["too short", "abc"],
    ["too long", "x".repeat(101)],
    ["not a string", 1234],
  ])("rejects a key that is %s", (_label, value) => {
    expect(parseDeleteKey(value)).toEqual({ ok: false });
  });
});
