// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import {
  UiPreferencesProvider,
  useUiPreferences,
} from "./ui-preferences-provider";

function wrapper({ children }: { children: ReactNode }) {
  return <UiPreferencesProvider>{children}</UiPreferencesProvider>;
}

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.outdoorMode;
});

describe("UiPreferencesProvider", () => {
  it("applies and removes outdoor mode on the root element", () => {
    const { result } = renderHook(() => useUiPreferences(), { wrapper });

    expect(document.documentElement.dataset.outdoorMode).toBeUndefined();

    act(() => result.current.setOutdoorMode(true));
    expect(document.documentElement.dataset.outdoorMode).toBe("true");

    act(() => result.current.setOutdoorMode(false));
    expect(document.documentElement.dataset.outdoorMode).toBeUndefined();
  });

  it("restores saved settings and persists changes", () => {
    window.localStorage.setItem(
      "baseball-scorer-ui-preferences",
      JSON.stringify({
        version: 1,
        outdoorMode: true,
        vibrationEnabled: false,
      })
    );

    const { result } = renderHook(() => useUiPreferences(), { wrapper });
    expect(result.current.outdoorMode).toBe(true);

    act(() => result.current.setOutdoorMode(false));
    expect(
      JSON.parse(
        window.localStorage.getItem("baseball-scorer-ui-preferences") ?? "{}"
      )
    ).toEqual({ version: 1, outdoorMode: false });
  });
});
