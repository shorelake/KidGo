import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { playerWinrate, playerScore } from "../src/api.js";

test("winrate and lead are converted from engine black perspective", () => {
  expect(playerWinrate(0.2, "W")).toBeCloseTo(0.8);
  expect(playerWinrate(0.2, "B")).toBe(0.2);
  expect(playerWinrate(undefined, "W")).toBeUndefined();
  expect(playerScore(-3, "W")).toBe("+3.0");
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

test("recommendations and analysis switch to the next player at each review turn", async ({
  page,
}) => {
  await login(page);
  const record = {
    title: "推荐方验收",
    moves: [
      ["B", "D4"],
      ["W", "Q16"],
      ["B", "D16"],
    ],
    analyses: Object.fromEntries(
      [0, 1, 2, 3].map((turn) => [
        turn,
        {
          turnNumber: turn,
          rootInfo: {
            currentPlayer: turn % 2 ? "W" : "B",
            winrate: 0.2,
            scoreLead: -3,
            visits: 100,
          },
          moveInfos: [
            {
              move: "B2",
              order: 0,
              winrate: 0.2,
              scoreLead: -3,
              visits: 100,
              pv: ["B2"],
            },
          ],
        },
      ]),
    ),
  };
  expect(
    (await page.request.post("/api/games", { data: { record } })).ok(),
  ).toBe(true);
  await page.getByRole("button", { name: "刷新棋局", exact: true }).click();
  await page.locator(".history-game").click();
  for (const turn of [3, 2, 1, 0]) {
    const color = turn % 2 ? "W" : "B",
      name = color === "W" ? "白方" : "黑方";
    await expect(page.locator(".analysis-perspective")).toContainText(name);
    await expect(page.locator(".metrics")).toContainText(
      color === "W" ? "80.0%" : "20.0%",
    );
    await expect(page.locator(".candidate").first()).toContainText(
      color === "W" ? "80.0%" : "20.0%",
    );
    await expect(page.locator(".recommendation-label")).toHaveText(
      `${name}推荐 · 第 ${turn + 1} 手`,
    );
    await expect(page.locator(".recommendation-marker")).toHaveAttribute(
      "data-player",
      color,
    );
    await expect(page.locator(".recommendation-ring")).toHaveAttribute(
      "stroke",
      color === "W" ? "#fff" : "#17221c",
    );
    if (turn)
      await page.getByRole("button", { name: "上一手", exact: true }).click();
  }
  await expect(page.locator(".review-chart svg circle")).toHaveCount(3);
  await expect(page.locator(".review-chart svg text").first()).toHaveText(
    "第 1 手",
  );
  await page.screenshot({
    path: "test-results/perspective-desktop.png",
    fullPage: true,
  });
});

for (const mode of ["play", "practice"]) {
test(`manual analysis after white reply in ${mode}`, async ({
  page,
}) => {
  await login(page);
  const requests = [];
  page.on("request", request => {
    if (request.method() === "POST" && request.url().endsWith("/api/analyze")) requests.push(request.postDataJSON());
  });
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await page.getByLabel("新建模式", { exact: true }).selectOption(mode);
  await page.getByLabel("棋盘", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("button", { name: "C3", exact: true }).dblclick();
  await expect(page.locator(".move-counter")).toHaveText("2 / 2");
  await page.waitForTimeout(1200);
  expect(requests).toHaveLength(1);
  expect(requests[0].purpose).toBe("play");
  await expect(page.locator(".recommendation-marker")).toHaveCount(0);
  await page.getByRole("button", { name: "分析局面", exact: true }).click();
  await expect(page.locator(".recommendation-label")).toHaveText(
    "黑方推荐 · 第 3 手",
  );
  await expect(page.locator(".recommendation-marker").first()).toHaveAttribute(
    "data-player",
    "B",
  );
  await expect(page.locator(".analysis-perspective")).toContainText("黑方");
  const count = await page.locator(".recommendation-marker").count();
  await page.getByRole("button", { name: "隐藏推荐落点", exact: true }).click();
  await expect(page.locator(".recommendation-marker")).toHaveCount(0);
  await expect(page.locator(".recommendation-label")).toHaveCount(0);
  await expect(page.locator(".candidate").first()).toBeVisible();
  await page.getByRole("button", { name: "显示推荐落点", exact: true }).click();
  await expect(page.locator(".recommendation-marker")).toHaveCount(count);
});
}
