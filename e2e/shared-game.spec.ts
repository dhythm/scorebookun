import { expect, test, type Browser, type Page } from "@playwright/test";

async function createGame(page: Page): Promise<string> {
  await page.goto("/");
  await page.getByRole("button", { name: /チーム1・チーム2/ }).click();
  // The confirmation toast sits on top of the fixed footer button.
  await page.getByRole("button", { name: "Close toast" }).click();
  await page.getByRole("button", { name: "試合を作成して開始" }).click();
  await page.waitForURL(/\/games\/[A-Za-z0-9_-]{22}$/);
  return page.url();
}

async function openAsAnotherScorer(browser: Browser, url: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await expect(page.getByText("0アウト").first()).toBeVisible();
  return { context, page };
}

async function recordStrikeout(page: Page) {
  await page.getByRole("button", { name: /^結果を?入力$/ }).click();
  await page.getByRole("button", { name: "三振" }).click();
}

test("a created game opens from its URL and follows other scorers", async ({
  page,
  browser,
}) => {
  const url = await createGame(page);
  const other = await openAsAnotherScorer(browser, url);

  await recordStrikeout(page);

  await expect(page.getByText("1アウト").first()).toBeVisible();
  await expect(other.page.getByText("1アウト").first()).toBeVisible({
    timeout: 15_000,
  });
  await other.context.close();
});

test("a stale scorer is warned and cannot overwrite newer plays", async ({
  page,
  browser,
}) => {
  const url = await createGame(page);
  const other = await openAsAnotherScorer(browser, url);

  await other.context.setOffline(true);
  await recordStrikeout(other.page);
  await expect(other.page.getByText("未送信の変更があります")).toBeVisible();

  await recordStrikeout(page);
  await recordStrikeout(page);
  await expect(page.getByText("2アウト").first()).toBeVisible();

  await other.context.setOffline(false);
  await expect(
    other.page.getByText("他の人がこの試合を更新しました")
  ).toBeVisible({ timeout: 15_000 });

  await other.page
    .getByRole("button", { name: "最新の内容を読み込む" })
    .click();
  await expect(other.page.getByText("2アウト").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("2アウト").first()).toBeVisible();
  await other.context.close();
});

test("an unknown game URL explains that the game does not exist", async ({
  page,
}) => {
  await page.goto("/games/does-not-exist");

  await expect(
    page.getByRole("heading", { name: "試合が見つかりません" })
  ).toBeVisible();
});

test("the share dialog shows a QR code for the game URL", async ({ page }) => {
  const url = await createGame(page);

  await page.getByRole("button", { name: "試合のURLを共有" }).click();

  const dialog = page.getByRole("dialog", { name: "試合を共有" });
  await expect(
    dialog.getByRole("img", { name: "試合URLのQRコード" })
  ).toBeVisible();
  await expect(dialog.getByText(url)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "URLをコピー" })
  ).toBeVisible();
});
