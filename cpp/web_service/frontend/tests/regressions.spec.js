import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  if (!(await (await page.request.get("/api/session")).json()).authenticated) {
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
  }
  await expect(page.locator(".workspace")).toBeVisible();
});

async function newFive(page, mode = "review") {
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await page.getByLabel("棋盘", { exact: true }).selectOption("5");
  await page.getByLabel("新建模式", { exact: true }).selectOption(mode);
  await page.getByRole("button", { name: "创建", exact: true }).click();
}

test("five board corner stones stay inside the drawing", async ({ page }) => {
  await newFive(page);
  await page.getByRole("button", { name: "A1", exact: true }).dblclick();
  const bounds = await page
    .locator('.board circle[fill="url(#black-stone)"]')
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        x: Number(n.getAttribute("cx")),
        y: Number(n.getAttribute("cy")),
        r: Number(n.getAttribute("r")),
      })),
    );
  expect(bounds.length).toBe(1);
  for (const { x, y, r } of bounds) {
    expect(x - r).toBeGreaterThanOrEqual(0);
    expect(y + r).toBeLessThanOrEqual(600);
  }
});

test("five board AI completion survives variation preview", async ({
  page,
}) => {
  await page.routeWebSocket("**/api/ws", (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message));
      if (parsed.type === "status" && parsed.status === "completed")
        setTimeout(() => ws.send(message), 700);
      else ws.send(message);
    });
  });
  await page.reload();
  await page.route("**/api/analyze/*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ response });
  });
  await newFive(page, "play");
  await page.getByRole("button", { name: "C3", exact: true }).dblclick();
  await expect(page.locator(".candidate").first()).toBeVisible();
  if (await page.locator(".candidate").first().isEnabled())
    await page.locator(".candidate").first().click();
  await expect(page.locator(".move-counter")).toHaveText("2 / 2", {
    timeout: 5000,
  });
});

test("placement requires confirmation, can move the preview and supports keyboard", async ({
  page,
}) => {
  await newFive(page);
  const a = page.getByRole("button", { name: "A1", exact: true });
  await a.click();
  await expect(page.locator(".pending-stone")).toHaveCount(1);
  await expect(page.locator(".pending-stone")).toHaveAttribute(
    "data-player",
    "B",
  );
  await expect(page.locator(".stone")).toHaveCount(0);
  await expect(page.locator(".move-counter")).toHaveText("0 / 0");
  expect(await a.evaluate((n) => getComputedStyle(n).stroke)).toBe("none");
  await page.getByRole("button", { name: "E5", exact: true }).click();
  await expect(page.locator("[data-move=E5] .pending-stone")).toBeVisible();
  await expect(page.locator("[data-move=A1] .pending-stone")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".pending-stone")).toHaveCount(0);
  const b = page.getByRole("button", { name: "B2", exact: true });
  await b.focus();
  await b.press("Enter");
  await expect(page.locator(".stone")).toHaveCount(0);
  await b.press("Enter");
  await expect(page.locator(".move-counter")).toHaveText("1 / 1");
  await a.click();
  await expect(page.locator(".pending-stone")).toHaveAttribute(
    "data-player",
    "W",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/placement-preview.png",
    fullPage: true,
  });
  await a.click();
  await expect(page.locator(".move-counter")).toHaveText("2 / 2");
  await expect(page.locator("[data-move=A1]")).toHaveAttribute(
    "data-color",
    "W",
  );
});

test("five board replies repeatedly and automatically archives games for sidebar review", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (let round = 0; round < 3; round++) {
    await newFive(page, "play");
    await page
      .getByLabel("搜索次数", { exact: true })
      .fill(String([1, 50, 500][round]));
    await page.getByRole("button", { name: "C3", exact: true }).dblclick();
    await expect(page.locator(".move-counter")).toHaveText("2 / 2", {
      timeout: 8000,
    });
    await expect(page.locator(".board-point[data-color=W]")).toHaveCount(1);
    const coordinates = await page
      .locator(".board-point[data-color=W]")
      .evaluateAll((nodes) => nodes.map((n) => n.dataset.move));
    expect(coordinates.every((m) => /^[A-E][1-5]$/.test(m))).toBe(true);
    await expect(page.locator(".history-game")).toHaveCount(round + 1);
    await expect(page.locator(".move-counter")).toHaveText("2 / 2");
  }
  await page.getByLabel("搜索历史棋局", { exact: true }).fill("不会存在的棋谱");
  await expect(page.locator(".history-game")).toHaveCount(0);
  await page.getByLabel("搜索历史棋局", { exact: true }).fill("");
  await page.locator(".history-game").last().click();
  await expect(page.locator(".move-counter")).toHaveText("2 / 2");
  await expect(page.locator(".history-actions")).toHaveCount(1);
  await expect(page.locator(".board-point[data-color=W]")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "复盘", exact: true }),
  ).toHaveClass("selected");
  await page.getByRole("button", { name: "上一手", exact: true }).click();
  await expect(page.locator(".move-counter")).toHaveText("1 / 2");
  await page.screenshot({
    path: "test-results/history-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "历史棋局", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "历史棋局", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/history-mobile.png",
    fullPage: true,
  });
  await page.locator(".history-game").first().click();
  await expect(page.locator(".history-sidebar")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("five board AI also replies with websocket unavailable", async ({
  page,
}) => {
  await page.routeWebSocket("**/api/ws", (ws) => ws.close());
  await page.reload();
  await newFive(page, "play");
  await page.getByRole("button", { name: "C3", exact: true }).dblclick();
  await expect(page.locator(".move-counter")).toHaveText("2 / 2", {
    timeout: 8000,
  });
  await expect(page.locator(".analysis-status")).toContainText("轮询连接");
  await expect(page.locator(".board-point[data-color=W]")).toHaveCount(1);
});

test("new game defaults, sequential names, history rename and deletion persist", async ({
  page,
}) => {
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await expect(page.getByLabel("新建模式", { exact: true })).toHaveValue(
    "play",
  );
  await expect(page.getByLabel("棋局名称", { exact: true })).toHaveValue(
    "练习1",
  );
  const fields = await page.locator(".game-form > label").allTextContents();
  expect(fields[0]).toContain("模式");
  expect(fields[1]).toContain("棋盘");
  expect(fields[2]).toContain("棋局名称");
  await page.getByLabel("棋盘", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("button", { name: "C3", exact: true }).dblclick();
  await expect(page.locator(".board-point[data-color=W]")).toHaveCount(1);
  await expect(page.locator(".history-game")).toHaveCount(1);
  page.removeAllListeners("dialog");
  page.on("dialog", (d) =>
    d.type() === "prompt" ? d.accept("第一次天元练习") : d.accept(),
  );
  await page.getByRole("button", { name: "改名 练习1", exact: true }).click();
  await expect(page.locator(".document-title h1")).toHaveText("第一次天元练习");
  await expect(page.locator(".history-game")).toContainText("第一次天元练习");
  await page.reload();
  await expect(page.locator(".history-game")).toContainText("第一次天元练习");
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await expect(page.getByLabel("棋局名称", { exact: true })).toHaveValue(
    "练习2",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({
    path: "test-results/new-game-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".history-actions")).toHaveCount(0);
  await page.locator(".history-game").click();
  await expect(page.locator(".history-actions")).toHaveCount(1);
  await page
    .getByRole("button", { name: "改名 第一次天元练习", exact: true })
    .click();
  await page.locator(".history-game").click();
  await expect(page.locator(".move-counter")).toHaveText("2 / 2");
  await page.screenshot({
    path: "test-results/history-actions.png",
    fullPage: true,
  });
  page.removeAllListeners("dialog");
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.dismiss();
  });
  await page
    .getByRole("button", { name: "删除 第一次天元练习", exact: true })
    .click();
  await expect(page.locator(".history-game")).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "删除 第一次天元练习", exact: true })
    .click();
  await expect(page.locator(".history-game")).toHaveCount(0);
  await expect(page.locator(".move-counter")).toHaveText("0 / 0");
  await page.reload();
  await expect(page.locator(".history-game")).toHaveCount(0);
});

test("saved analysis explains white losses and opens the position before the move", async ({
  page,
}) => {
  const candidate = (move, order, lead) => ({
    move,
    order,
    scoreLead: lead,
    winrate: 0.5,
    visits: 100,
    pv: [move],
  });
  const saved = await page.request.post("/api/games", {
    data: {
      record: {
        size: 5,
        title: "学习解读验收",
        moves: [
          ["B", "C3"],
          ["W", "B3"],
        ],
        analyses: {
          1: {
            turnNumber: 1,
            rootInfo: {
              currentPlayer: "W",
              scoreLead: -2,
              winrate: 0.4,
              visits: 200,
            },
            moveInfos: [candidate("B2", 0, -2), candidate("B3", 1, 1)],
          },
        },
      },
    },
  });
  expect(saved.ok()).toBe(true);
  await page.getByRole("button", { name: "刷新棋局", exact: true }).click();
  await page
    .locator(".history-game")
    .filter({ hasText: "学习解读验收" })
    .click();
  await expect(page.locator(".move-counter")).toHaveText("2 / 2");
  await expect(page.locator(".board-point[data-color=W]")).toHaveCount(1);
  await page.locator(".review-mistake").click();
  await expect(page.locator(".move-counter")).toHaveText("1 / 2");
  const explanation = page.getByRole("region", { name: "学习解读" });
  await expect(explanation).toContainText("白棋预计领先 2.0 目");
  await expect(explanation).toContainText("预计损失 3.0 目");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await explanation.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/learning-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "分析浮层", exact: true }).click();
  await explanation.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-results/learning-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("four audible tracks support selection, loop and random advancement", async ({
  page,
}) => {
  const tracks = await (await page.request.get("/music/tracks.json")).json();
  expect(tracks).toHaveLength(4);
  const energy = await page.evaluate(async (tracks) => {
    const context = new OfflineAudioContext(1, 1, 22050);
    return Promise.all(
      tracks.map(async (track) => {
        const data = await (await fetch("/music/" + track.file)).arrayBuffer();
        const decoded = await context.decodeAudioData(data);
        const pcm = decoded.getChannelData(0);
        let sum = 0,
          peak = 0;
        for (const n of pcm) {
          sum += n * n;
          peak = Math.max(peak, Math.abs(n));
        }
        return {
          duration: decoded.duration,
          rms: Math.sqrt(sum / pcm.length),
          peak,
        };
      }),
    );
  }, tracks);
  for (const song of energy) {
    expect(song.duration).toBeGreaterThan(20);
    expect(song.rms).toBeGreaterThan(0.01);
    expect(song.peak).toBeLessThan(0.99);
  }
  await page.getByRole("button", { name: "暂停音乐", exact: true }).click();
  await page.getByRole("button", { name: "音乐设置", exact: true }).click();
  await expect(
    page.getByLabel("音乐曲目", { exact: true }).locator("option"),
  ).toHaveCount(4);
  await page
    .getByLabel("音乐曲目", { exact: true })
    .selectOption("bubble-waltz");
  expect(await page.locator("audio").evaluate((a) => a.paused && a.loop)).toBe(
    true,
  );
  if (
    await page
      .getByRole("button", { name: "播放音乐", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "播放音乐", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(0.1);
  if (!(await page.getByLabel("音乐曲目", { exact: true }).isVisible()))
    await page.getByRole("button", { name: "音乐设置", exact: true }).click();
  await page.getByRole("button", { name: "随机切换", exact: true }).click();
  await page.locator("audio").evaluate((a) => {
    a.currentTime = a.duration - 0.1;
  });
  await expect
    .poll(() => page.locator("audio").getAttribute("src"))
    .not.toBe("/music/bubble-waltz.wav");
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "单曲循环", exact: true }).click();
  expect(await page.locator("audio").evaluate((a) => a.loop)).toBe(true);
  await page.getByRole("button", { name: "暂停音乐", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  if (!(await page.getByLabel("音乐曲目", { exact: true }).isVisible()))
    await page.getByRole("button", { name: "音乐设置", exact: true }).click();
  const bounds = await page.locator(".music-panel").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: "test-results/music-mobile.png",
    fullPage: true,
  });
});
