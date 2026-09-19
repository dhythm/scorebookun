import { expect, test } from "@playwright/test";

test("shows the game setup screen", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "新しい試合を設定" })
  ).toBeVisible();
});
