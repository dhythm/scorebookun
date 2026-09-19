// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AlphaDisclaimer } from "./alpha-disclaimer";

afterEach(cleanup);

describe("AlphaDisclaimer", () => {
  it("warns that server data may be erased and points to export", () => {
    render(<AlphaDisclaimer />);

    const note = screen.getByRole("note");
    expect(note.textContent).toContain("アルファ版");
    expect(note.textContent).toContain("消去される可能性");
    expect(note.textContent).toContain("エクスポート");
  });
});
