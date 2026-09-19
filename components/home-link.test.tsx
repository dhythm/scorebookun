// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HomeLink } from "./home-link";

describe("HomeLink", () => {
  afterEach(cleanup);

  it("links to the top page with a name that says where it goes", () => {
    render(<HomeLink />);

    const link = screen.getByRole("link", { name: "トップページへ戻る" });
    expect(link.getAttribute("href")).toBe("/");
  });
});
