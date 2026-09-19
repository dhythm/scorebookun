export const UI_PREFERENCES_STORAGE_KEY =
  "baseball-scorer-ui-preferences" as const;
const UI_PREFERENCES_VERSION = 1 as const;

export interface UiPreferences {
  outdoorMode: boolean;
}

export const DEFAULT_UI_PREFERENCES: Readonly<UiPreferences> = {
  outdoorMode: false,
};

interface UiPreferencesEnvelope extends UiPreferences {
  version: typeof UI_PREFERENCES_VERSION;
}

export interface UiPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadUiPreferences(
  storage: UiPreferencesStorage
): UiPreferences {
  try {
    const serialized = storage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (serialized === null) return { ...DEFAULT_UI_PREFERENCES };
    const parsed: unknown = JSON.parse(serialized);
    if (
      !isRecord(parsed) ||
      parsed.version !== UI_PREFERENCES_VERSION ||
      typeof parsed.outdoorMode !== "boolean"
    ) {
      return { ...DEFAULT_UI_PREFERENCES };
    }
    // Older versions also stored a vibration setting; it is ignored.
    return { outdoorMode: parsed.outdoorMode };
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function saveUiPreferences(
  storage: UiPreferencesStorage,
  preferences: UiPreferences
): boolean {
  const envelope: UiPreferencesEnvelope = {
    version: UI_PREFERENCES_VERSION,
    ...preferences,
  };
  try {
    storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}
