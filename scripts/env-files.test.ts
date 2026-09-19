import { describe, expect, it } from "vitest";

import { findEnvFiles } from "./env-files";

describe("findEnvFiles", () => {
  it("lists existing files with .env.local taking priority, like Next.js", () => {
    expect(findEnvFiles(() => true)).toEqual([".env.local", ".env"]);
  });

  it("works with only one of the files", () => {
    expect(findEnvFiles((file) => file === ".env.local")).toEqual([
      ".env.local",
    ]);
    expect(findEnvFiles((file) => file === ".env")).toEqual([".env"]);
  });

  it("returns nothing when variables come from the shell only", () => {
    expect(findEnvFiles(() => false)).toEqual([]);
  });
});
