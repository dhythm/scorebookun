import { expect, test } from "@playwright/test";

test("shows the game setup screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "試合を作成" })).toBeVisible();
  await expect(page.getByRole("banner").getByText("α版")).toBeVisible();
});
