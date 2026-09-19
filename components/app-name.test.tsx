// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AppName } from "./app-name";

describe("AppName", () => {
  afterEach(cleanup);

  it("states next to the name that this is an alpha version", () => {
    render(<AppName />);

    expect(screen.getByText("スコアブッくん")).toBeTruthy();
    expect(screen.getByText("α版")).toBeTruthy();
  });
});
