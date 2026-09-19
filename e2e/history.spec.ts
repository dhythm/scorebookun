import { expect, test } from "@playwright/test";

test("a game can be left, exported from the history, and imported elsewhere", async ({
  page,
  browser,
}, testInfo) => {
  await page.goto("/games/seed-live-slugfest");
  await expect(page.getByText("1アウト").first()).toBeVisible();

  await page.getByRole("link", { name: "トップページへ戻る" }).click();
  await expect(page.getByRole("heading", { name: "試合を作成" })).toBeVisible();

  await page.getByRole("button", { name: /試合履歴/ }).click();
  await expect(
    page.getByRole("button", { name: /荒川サンダース 6\s*-\s*10/ })
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "試合履歴をエクスポート" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^scorebook-history-\d{4}-\d{2}-\d{2}\.json$/
  );
  const exportedPath = testInfo.outputPath("exported-history.json");
  await download.saveAs(exportedPath);

  const otherDevice = await browser.newContext();
  const otherPage = await otherDevice.newPage();
  await otherPage.goto("/");
  await otherPage.getByRole("button", { name: /試合履歴/ }).click();
  await expect(otherPage.getByText("保存された試合はありません")).toBeVisible();
  await expect(
    otherPage.getByRole("button", { name: "試合履歴をエクスポート" })
  ).toBeDisabled();

  await otherPage
    .getByLabel("試合履歴をインポート")
    .setInputFiles(exportedPath);

  await expect(otherPage.getByText("1試合をインポートしました")).toBeVisible();
  await expect(
    otherPage.getByRole("button", { name: /荒川サンダース 6\s*-\s*10/ })
  ).toBeVisible();
  await otherDevice.close();
});

test("importing a file the app did not export explains what to choose", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /試合履歴/ }).click();

  await page.getByLabel("試合履歴をインポート").setInputFiles({
    name: "notes.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"hello":"world"}'),
  });

  await expect(page.getByText(/インポートできませんでした/)).toBeVisible();
});
