import { expect, test } from "@playwright/test";
import { createStandardGamePreset } from "../lib/game-preset";
import { randomUUID } from "node:crypto";

test.use({ viewport: { width: 375, height: 812 } });

test("a late-inning game opens at its score and keeps touch controls available", async ({
  page,
}) => {
  await page.goto("/games/seed-live-last-chance");
  const summary = page.getByRole("group", { name: "現在のスコア" });
  await expect(summary).toBeInViewport();
  await expect(page.getByText("この打席", { exact: true })).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "結果入力", exact: true })
  ).toBeInViewport();
  for (const runner of await page
    .getByRole("button", { name: /塁走者 .* の走塁を入力/ })
    .all()) {
    const box = await runner.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(runner).toBeInViewport();
  }
  await page.getByRole("button", { name: "1塁走者 清水 の走塁を入力" }).click();
  await expect(
    page.getByRole("heading", { name: "走塁・打席外" })
  ).toBeVisible();
});

test("long names fit outdoors and a recorded play does not cover the next input", async ({
  page,
  request,
}) => {
  const preset = createStandardGamePreset(randomUUID);
  preset.away.name = "多摩川ベースボールクラブ・オールスターズ";
  preset.home.name = "世田谷少年野球スポーツクラブ";
  preset.away.players[0].name = "アレクサンダー山田太郎";
  const response = await request.post("/api/games", {
    data: {
      date: new Date().toISOString(),
      config: { regulationInnings: 7, teams: preset },
    },
  });
  expect(response.status()).toBe(201);
  const { game } = await response.json();
  await page.goto(`/games/${game.id}`);
  await page.getByRole("button", { name: "表示の設定" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByRole("group", { name: "現在のスコア" })).toContainText(
    preset.away.name
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    375
  );
  const header = await page.getByRole("banner").boundingBox();
  const settings = await page
    .getByRole("button", { name: "表示の設定" })
    .boundingBox();
  expect(settings!.x + settings!.width).toBeLessThanOrEqual(header!.width);
  const resultButton = page.getByRole("button", {
    name: "結果入力",
    exact: true,
  });
  await resultButton.click();
  await page.getByRole("button", { name: "三振", exact: true }).click();
  await expect(
    page.getByText("打席を記録しました", { exact: true })
  ).toBeVisible();
  const toast = await page.locator("[data-sonner-toast]").boundingBox();
  const input = await resultButton.boundingBox();
  expect(toast!.y + toast!.height).toBeLessThanOrEqual(input!.y);
  await expect(
    page.getByRole("group", { name: "現在のスコア" })
  ).toBeInViewport();
  await resultButton.click();
  await expect(
    page.getByRole("heading", { name: "打席結果の入力" })
  ).toBeVisible();
});
