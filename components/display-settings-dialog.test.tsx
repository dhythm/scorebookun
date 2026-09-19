// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { DisplaySettingsDialog } from "./display-settings-dialog";
import { UiPreferencesProvider } from "./ui-preferences-provider";

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.outdoorMode;
});

describe("DisplaySettingsDialog", () => {
  it("offers outdoor mode as an opt-in setting and no vibration setting", async () => {
    const user = userEvent.setup();
    render(
      <UiPreferencesProvider>
        <DisplaySettingsDialog />
      </UiPreferencesProvider>
    );

    await user.click(screen.getByRole("button", { name: "表示の設定" }));
    const outdoorMode = screen.getByRole("checkbox", { name: /屋外モード/ });

    expect(outdoorMode.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("checkbox", { name: /振動/ })).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    await user.click(outdoorMode);
    expect(outdoorMode.getAttribute("aria-checked")).toBe("true");
  });
});
