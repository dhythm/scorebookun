import { describe, expect, it } from "vitest";

import type { StorageLike } from "./local-storage";
import { createSyncMetaStore } from "./sync-meta";

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("createSyncMetaStore", () => {
  it("remembers the base version and unsent flag per game", () => {
    const storage = memoryStorage();
    createSyncMetaStore(storage).set("game-1", { baseVersion: 3, dirty: true });

    const store = createSyncMetaStore(storage);
    expect(store.get("game-1")).toEqual({ baseVersion: 3, dirty: true });
    expect(store.get("game-2")).toBeNull();
  });

  it("forgets a removed game", () => {
    const store = createSyncMetaStore(memoryStorage());
    store.set("game-1", { baseVersion: 1, dirty: false });

    store.remove("game-1");

    expect(store.get("game-1")).toBeNull();
  });

  it.each([
    ["malformed JSON", "{"],
    ["a non-object", "[]"],
    ["an invalid entry", '{"game-1":{"baseVersion":"1","dirty":false}}'],
  ])("treats %s as no metadata", (_label, stored) => {
    const store = createSyncMetaStore(
      memoryStorage({ "scorebookun-sync-meta": stored })
    );

    expect(store.get("game-1")).toBeNull();
  });
});
