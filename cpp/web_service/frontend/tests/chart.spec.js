import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("chart clicks follow rendered SVG points across desktop, tablet and phone", async ({
  page,
}) => {
  await page.goto("/");
  const token = (
    await readFile(new URL("../../data/access.token", import.meta.url), "utf8")
  ).trim();
  await page.getByLabel("访问口令", { exact: true }).fill(token);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".workspace")).toBeVisible();
  const turns = [1, 5, 15, 30, 45, 55, 60];
  const saved = await page.request.post("/api/games", {
    data: {
      record: {
        title: "曲线坐标验收",
        moves: Array.from({ length: 60 }, (_, i) => [
          i % 2 ? "W" : "B",
          "pass",
        ]),
        analyses: Object.fromEntries(
          turns.map((turn) => [
            turn,
            {
              turnNumber: turn,
              rootInfo: {
                currentPlayer: turn % 2 ? "W" : "B",
                winrate: 0.3 + turn / 150,
                scoreLead: turn / 10 - 3,
                visits: 100,
              },
              moveInfos: [],
            },
          ]),
        ),
      },
    },
  });
  expect(saved.ok()).toBe(true);
  await page.getByRole("button", { name: "刷新棋局", exact: true }).click();
  await page
    .locator(".history-game")
    .filter({ hasText: "曲线坐标验收" })
    .click();
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 600 && !(await page.locator(".review-chart").isVisible()))
      await page.getByRole("button", { name: "局势浮层", exact: true }).click();
    const chart = page.getByRole("img", {
      name: "胜率与目差曲线",
      exact: true,
    });
    for (const index of [0, 1, 4, 2, 5, 3, 6]) {
      await chart.locator("circle").nth(index).click({ force: true });
      await expect(page.locator(".move-counter")).toHaveText(
        `${turns[index]} / 60`,
      );
    }
    // Exercise empty plot space too, independent of circle event targets.
    await chart.scrollIntoViewIfNeeded();
    const location = await chart.evaluate((svg) => {
      const point = new DOMPoint(12 + (21 / 59) * 376, 50).matrixTransform(
        svg.getScreenCTM(),
      );
      return { x: point.x, y: point.y };
    });
    await page.mouse.click(location.x, location.y);
    await expect(page.locator(".move-counter")).toHaveText("22 / 60");
  }
});
