import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { nextGameName } from "../src/naming.js";

test("name sequences are independent and consider saved history", () => {
  const games = [{ title: "练习9" }, { title: "启蒙3" }, { title: "复盘2" }];
  expect(nextGameName("play", games, 10)).toBe("练习11");
  expect(nextGameName("practice", games)).toBe("启蒙4");
  expect(nextGameName("review", games)).toBe("复盘3");
});

async function login(page) {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  const token = (
    await readFile(new URL("../../data/access.token", import.meta.url), "utf8")
  ).trim();
  await page.getByLabel("访问口令", { exact: true }).fill(token);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".workspace")).toBeVisible();
}

test("new game switches automatic prefixes without overwriting custom titles", async ({
  page,
}) => {
  await login(page);
  for (const [mode, expected] of [
    ["play", "练习1"],
    ["practice", "启蒙1"],
    ["review", "复盘1"],
    ["practice", "启蒙2"],
    ["play", "练习2"],
  ]) {
    await page.getByRole("button", { name: "新建棋局", exact: true }).click();
    await page.getByLabel("新建模式", { exact: true }).selectOption(mode);
    await expect(page.getByLabel("棋局名称", { exact: true })).toHaveValue(
      expected,
    );
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(page.locator(".document-title h1")).toHaveText(expected);
  }
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await page.getByLabel("棋局名称", { exact: true }).fill("周末练习");
  await page.getByLabel("新建模式", { exact: true }).selectOption("practice");
  await expect(page.getByLabel("棋局名称", { exact: true })).toHaveValue(
    "周末练习",
  );
});

test("history collapses on desktop and phone analysis floats without changing tablet layout", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".history-sidebar")).toBeVisible();
  await page.getByRole("button", { name: "收起历史棋局", exact: true }).click();
  await expect(page.locator(".history-sidebar")).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".history-sidebar")).not.toBeVisible();
  await page.getByRole("button", { name: "历史棋局", exact: true }).click();
  await expect(page.locator(".history-sidebar")).toBeVisible();
  await page.screenshot({
    path: "test-results/layout-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator(".analysis-aside")).toBeVisible();
  await expect(page.locator(".review-chart")).toBeVisible();
  await expect(page.locator(".mobile-analysis-dock")).not.toBeVisible();
  expect(
    await page
      .locator(".analysis-aside")
      .evaluate((n) => getComputedStyle(n).position),
  ).not.toBe("fixed");
  await page.screenshot({
    path: "test-results/layout-tablet.png",
    fullPage: true,
  });

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    if (
      await page
        .getByRole("button", { name: "收起历史棋局", exact: true })
        .isVisible()
    )
      await page
        .getByRole("button", { name: "收起历史棋局", exact: true })
        .click();
    await expect(page.locator(".analysis-aside")).not.toBeVisible();
    await expect(page.locator(".review-chart")).not.toBeVisible();
    await page.screenshot({
      path: `test-results/layout-phone-${width}-closed.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "分析浮层", exact: true }).click();
    await expect(page.locator(".analysis-aside")).toBeVisible();
    expect(
      await page
        .locator(".analysis-aside")
        .evaluate((n) => getComputedStyle(n).position),
    ).toBe("fixed");
    await page.getByRole("button", { name: "分析局面", exact: true }).click();
    await expect(page.locator(".candidate").first()).toBeVisible();
    await page.screenshot({
      path: `test-results/layout-phone-${width}-analysis.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "局势浮层", exact: true }).click();
    await expect(page.locator(".analysis-aside")).not.toBeVisible();
    await expect(page.locator(".review-chart")).toBeVisible();
    await page.getByRole("button", { name: "收起局势", exact: true }).click();
    await expect(page.locator(".review-chart")).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "历史棋局", exact: true }).click();
  }
});
