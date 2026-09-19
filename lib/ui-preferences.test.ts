import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_UI_PREFERENCES,
  UI_PREFERENCES_STORAGE_KEY,
  loadUiPreferences,
  saveUiPreferences,
} from "./ui-preferences";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue;
    }),
  };
}

describe("UI preferences", () => {
  it("uses disabled defaults when no preferences have been saved", () => {
    expect(loadUiPreferences(memoryStorage())).toEqual({
      outdoorMode: false,
    });
  });

  it("round-trips versioned preferences", () => {
    const storage = memoryStorage();
    const preferences = { outdoorMode: true };

    expect(saveUiPreferences(storage, preferences)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      UI_PREFERENCES_STORAGE_KEY,
      expect.stringContaining('"version":1')
    );
    expect(loadUiPreferences(storage)).toEqual(preferences);
  });

  it("keeps outdoor mode from preferences saved when vibration still existed", () => {
    const storage = memoryStorage(
      '{"version":1,"outdoorMode":true,"vibrationEnabled":true}'
    );

    const preferences = loadUiPreferences(storage);
    saveUiPreferences(storage, preferences);

    expect(preferences).toEqual({ outdoorMode: true });
    expect(storage.setItem).toHaveBeenLastCalledWith(
      UI_PREFERENCES_STORAGE_KEY,
      '{"version":1,"outdoorMode":true}'
    );
  });

  it("falls back safely for malformed data and storage failures", () => {
    const malformedStorage = memoryStorage('{"version":1,"outdoorMode":"yes"}');
    const unavailableStorage = {
      getItem: vi.fn(() => {
        throw new Error("unavailable");
      }),
      setItem: vi.fn(() => {
        throw new Error("unavailable");
      }),
    };

    expect(loadUiPreferences(malformedStorage)).toEqual(DEFAULT_UI_PREFERENCES);
    expect(loadUiPreferences(unavailableStorage)).toEqual(
      DEFAULT_UI_PREFERENCES
    );
    expect(saveUiPreferences(unavailableStorage, DEFAULT_UI_PREFERENCES)).toBe(
      false
    );
  });
});
