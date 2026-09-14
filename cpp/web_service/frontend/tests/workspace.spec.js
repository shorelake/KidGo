import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const session = await page.request.get("/api/session");
  if (!(await session.json()).authenticated) {
    const token =
      process.env.KATAGO_TEST_TOKEN ||
      (
        await readFile(
          new URL("../../data/access.token", import.meta.url),
          "utf8",
        )
      ).trim();
    await page.getByLabel("访问口令", { exact: true }).fill(token);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.locator(".workspace")).toBeVisible();
  }
});

test("review, live analysis, PV, SGF, persistence and responsive layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await expect(page.getByText("引擎就绪", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await page.getByLabel("新建模式", { exact: true }).selectOption("review");
  await page.getByLabel("棋局名称", { exact: true }).fill("浏览器验收棋谱");
  await page.getByLabel("棋盘", { exact: true }).selectOption("9");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("button", { name: "D4", exact: true }).dblclick();
  await page.getByRole("button", { name: "F6", exact: true }).dblclick();
  await page.getByRole("button", { name: "D5", exact: true }).dblclick();
  await expect(page.locator(".move-counter")).toHaveText("3 / 3");
  await page.getByLabel("搜索次数", { exact: true }).fill("100");
  await page.getByRole("button", { name: "分析局面", exact: true }).click();
  await expect(page.locator(".candidate").first()).toBeVisible();
  await expect(page.locator(".analysis-status")).toContainText("已搜索");
  await expect(page.getByRole("region", { name: "学习解读" })).toContainText(
    "参考变化",
  );
  await page.locator(".candidate").first().click();
  await expect(page.locator(".pv-toolbar")).toBeVisible();
  await page.getByRole("button", { name: "关闭变化", exact: true }).click();
  await page.getByRole("button", { name: "整盘分析", exact: true }).click();
  await expect(page.getByText("整盘分析完成", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "学习解读" })).toContainText(
    "复盘重点",
  );
  await page
    .getByLabel("棋谱注释", { exact: true })
    .fill("中文注释，保存后应保留。");
  await page.getByRole("button", { name: "保存棋谱", exact: true }).click();
  await expect(page.getByText("棋谱已保存", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "第一手", exact: true }).click();
  await expect(page.locator(".move-counter")).toHaveText("0 / 3");
  await page.getByRole("button", { name: "最后一手", exact: true }).click();
  await page.reload();
  await expect(page.locator(".move-counter")).toHaveText("3 / 3");
  await expect(page.getByLabel("棋谱注释", { exact: true })).toHaveValue(
    "中文注释，保存后应保留。",
  );
  await page.getByRole("button", { name: "棋谱库", exact: true }).click();
  await page.locator(".library-item").getByRole("button").first().click();
  await expect(page.locator(".document-title")).toContainText("浏览器验收棋谱");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 SGF", exact: true }).click();
  const download = await downloading;
  const sgf = await readFile(await download.path(), "utf8");
  expect(sgf).toContain("中文注释");
  await page.locator("input[type=file]").setInputFiles({
    name: "roundtrip.sgf",
    mimeType: "application/x-go-sgf",
    buffer: Buffer.from(sgf),
  });
  await expect(page.getByText("棋谱已导入", { exact: true })).toBeVisible();
  await expect(page.locator(".move-counter")).toHaveText("3 / 3");
  await page.getByRole("button", { name: "分析局面", exact: true }).click();
  await expect(page.locator(".analysis-status")).toContainText("已搜索");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".board")).toBeVisible();
    await page.screenshot({
      path: "test-results/mobile-" + viewport.width + ".png",
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("human versus KataGo, undo and passes", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await page.getByLabel("棋盘", { exact: true }).selectOption("9");
  await page.getByLabel("新建模式", { exact: true }).selectOption("play");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByLabel("搜索次数", { exact: true }).fill("100");
  await page.getByRole("button", { name: "D4", exact: true }).dblclick();
  await expect(page.locator(".move-counter")).toHaveText("2 / 2", {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "悔棋", exact: true }).click();
  await expect(page.locator(".move-counter")).toHaveText("0 / 0");
  await expect(
    page.getByRole("button", { name: "对弈", exact: true }),
  ).toHaveClass("selected");
  await page.getByRole("button", { name: "复盘", exact: true }).click();
  await page.getByRole("button", { name: "停一手", exact: true }).click();
  await page.getByRole("button", { name: "停一手", exact: true }).click();
  await expect(page.locator(".turn-label")).toHaveText("双方停一手");
});

test("small boards, practice hints and original music", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  for (const size of [5, 7, 11, 15, 19]) {
    await page.getByRole("button", { name: "新建棋局", exact: true }).click();
    await page.getByLabel("棋盘", { exact: true }).selectOption(String(size));
    await page.getByLabel("新建模式", { exact: true }).selectOption("review");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(
      page.getByRole("group", { name: size + "路围棋棋盘", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "C3", exact: true }).dblclick();
    await page.getByLabel("搜索次数", { exact: true }).fill("20");
    await page.getByRole("button", { name: "分析局面", exact: true }).click();
    await expect(page.locator(".analysis-status")).toContainText("已搜索");
    expect(await page.locator(".board rect[role=button]").count()).toBe(
      size * size,
    );
  }
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await page.getByLabel("棋盘", { exact: true }).selectOption("5");
  await page.getByLabel("新建模式", { exact: true }).selectOption("practice");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("button", { name: "提示一手", exact: true }).click();
  await expect(page.locator(".candidate").first()).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "播放音乐", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "播放音乐", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(0.1);
  expect(
    await page
      .locator("audio")
      .evaluate((a) => a.loop && a.volume <= 0.6 && !a.paused),
  ).toBe(true);
  await page.getByRole("button", { name: "暂停音乐", exact: true }).click();
  expect(await page.locator("audio").evaluate((a) => a.paused)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/practice-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
