// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ShareGameDialog } from "./share-game-dialog";

const url = "https://example.test/games/d0Z1ivxAvSYLhoqYN2avGQ";

function renderDialog() {
  return render(
    <ShareGameDialog
      open
      onOpenChange={() => {}}
      title="Away 対 Home"
      url={url}
    />
  );
}

describe("ShareGameDialog", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows a QR code and the URL of the game", () => {
    renderDialog();

    const qrCode = screen.getByRole("img", { name: "試合URLのQRコード" });
    expect(qrCode.querySelector("path")).not.toBeNull();
    expect(screen.getByText(url)).toBeTruthy();
  });

  it("copies the URL", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderDialog();

    await user.click(screen.getByRole("button", { name: "URLをコピー" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(url));
  });

  it("offers the native share sheet only where it exists", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.queryByRole("button", { name: "アプリで共有" })).toBeNull();
    cleanup();

    const share = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { share });
    renderDialog();
    await user.click(screen.getByRole("button", { name: "アプリで共有" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({ title: "Away 対 Home", url })
    );
  });
});
