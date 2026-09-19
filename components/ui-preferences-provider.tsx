"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  DEFAULT_UI_PREFERENCES,
  loadUiPreferences,
  saveUiPreferences,
  type UiPreferences,
} from "@/lib/ui-preferences";

interface UiPreferencesContextValue extends UiPreferences {
  setOutdoorMode: (enabled: boolean) => void;
}

const UiPreferencesContext = createContext<UiPreferencesContextValue | null>(
  null
);

function getInitialPreferences(): UiPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_UI_PREFERENCES };
  try {
    return loadUiPreferences(window.localStorage);
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

function saveBrowserPreferences(preferences: UiPreferences): void {
  try {
    saveUiPreferences(window.localStorage, preferences);
  } catch {
    // Preferences remain active for this session when storage is unavailable.
  }
}

export function UiPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<UiPreferences>(
    getInitialPreferences
  );

  useEffect(() => {
    const root = document.documentElement;
    if (preferences.outdoorMode) {
      root.dataset.outdoorMode = "true";
    } else {
      delete root.dataset.outdoorMode;
    }
    saveBrowserPreferences(preferences);
  }, [preferences]);

  useEffect(
    () => () => {
      delete document.documentElement.dataset.outdoorMode;
    },
    []
  );

  const setOutdoorMode = useCallback((enabled: boolean) => {
    setPreferences((current) => ({ ...current, outdoorMode: enabled }));
  }, []);

  return (
    <UiPreferencesContext.Provider value={{ ...preferences, setOutdoorMode }}>
      {children}
    </UiPreferencesContext.Provider>
  );
}

export function useUiPreferences(): UiPreferencesContextValue {
  const context = useContext(UiPreferencesContext);
  if (!context) {
    throw new Error(
      "useUiPreferences must be used within a UiPreferencesProvider"
    );
  }
  return context;
}
