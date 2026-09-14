import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  const token = (
    await readFile(new URL("../../data/access.token", import.meta.url), "utf8")
  ).trim();
  await page.getByLabel("访问口令", { exact: true }).fill(token);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.locator(".workspace")).toBeVisible();
});

test("music defaults on, waits for a gesture when blocked, and remembers explicit pause", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.musicGesture = false;
    window.blockedMusic = 0;
    document.addEventListener(
      "pointerdown",
      () => {
        window.musicGesture = true;
      },
      true,
    );
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (!window.musicGesture) {
        window.blockedMusic++;
        return Promise.reject(
          new DOMException("Gesture required", "NotAllowedError"),
        );
      }
      return play.apply(this, args);
    };
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "暂停音乐", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.blockedMusic))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "A1", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "暂停音乐", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "播放音乐", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "B1", exact: true }).click();
  expect(await page.locator("audio").evaluate((a) => a.paused)).toBe(true);
  await page.getByRole("button", { name: "播放音乐", exact: true }).click();
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.currentTime))
    .toBeGreaterThan(0.1);
});

test("practice offers five capture goals and persists the selected goal", async ({
  page,
}) => {
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await page.getByLabel("新建模式", { exact: true }).selectOption("practice");
  const goal = page.getByLabel("吃子级别", { exact: true });
  await expect(goal).toHaveValue("3");
  expect(
    await goal
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => node.value)),
  ).toEqual(["3", "5", "7", "13", "21"]);
  await goal.selectOption("21");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.locator(".practice-progress")).toContainText(
    "净领先 21 子",
  );
  await page.getByRole("button", { name: "保存棋谱", exact: true }).click();
  await expect(page.locator(".document-title")).toContainText("已保存");
  const list = await (await page.request.get("/api/games")).json();
  const saved = await (
    await page.request.get("/api/games/" + list[0].id)
  ).json();
  expect(saved.record.captureTarget).toBe(21);
});

test("stone sound starts only after confirmed placement and respects mute", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.stoneTones = 0;
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const oscillator = original.apply(this, args),
        start = oscillator.start.bind(oscillator);
      oscillator.start = (...args) => {
        window.stoneTones++;
        start(...args);
      };
      return oscillator;
    };
  });
  await page.reload();
  await page.getByRole("button", { name: "A1", exact: true }).click();
  expect(await page.evaluate(() => window.stoneTones)).toBe(0);
  await page.getByRole("button", { name: "A1", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.stoneTones)).toBe(1);
  await page.getByRole("button", { name: "关闭落子音效", exact: true }).click();
  await page.getByRole("button", { name: "B1", exact: true }).dblclick();
  await expect(page.locator(".move-counter")).toHaveText("2 / 2");
  expect(await page.evaluate(() => window.stoneTones)).toBe(1);
  await page.getByRole("button", { name: "停一手", exact: true }).click();
  expect(await page.evaluate(() => window.stoneTones)).toBe(1);
});

test("capture target ends practice before an AI reply and persists", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.victories = 0;
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = original.apply(this, args),
        start = source.start.bind(source);
      source.start = (...args) => {
        if (source.buffer?.duration > 3) window.victories++;
        start(...args);
      };
      return source;
    };
  });
  await page.reload();
  const saved = await page.request.post("/api/games", {
    data: {
      record: {
        size: 5,
        title: "吃子目标验收",
        aiLevel: "starter",
        captureTarget: 3,
        initialStones: [
          ["B", "B1"],
          ["B", "B2"],
          ["B", "B3"],
          ["W", "A1"],
          ["W", "A2"],
          ["W", "A3"],
        ],
      },
    },
  });
  expect(saved.ok()).toBe(true);
  await page.getByRole("button", { name: "刷新棋局", exact: true }).click();
  await page.locator(".history-game").click();
  await page.getByRole("button", { name: "练习", exact: true }).click();
  if (
    await page
      .getByRole("button", { name: "播放音乐", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "播放音乐", exact: true }).click();
  let botRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/analyze"))
      botRequests++;
  });
  await page.getByRole("button", { name: "A4", exact: true }).dblclick();
  await expect(page.locator(".game-outcome")).toContainText("黑方吃子达标获胜");
  await expect(page.locator(".game-outcome")).toContainText("净提子领先 3 子");
  await expect.poll(() => page.evaluate(() => window.victories)).toBe(1);
  await expect
    .poll(() => page.locator("audio").evaluate((audio) => audio.volume))
    .toBeCloseTo(0.04);
  await expect(
    page.getByRole("button", { name: "停一手", exact: true }),
  ).toBeDisabled();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get("/api/games/" + (await saved.json()).id)
          ).json()
        ).record.result,
    )
    .toBe("B+Capture");
  expect(botRequests).toBe(0);
  await expect
    .poll(() => page.locator("audio").evaluate((audio) => audio.volume), {
      timeout: 6000,
    })
    .toBeCloseTo(0.2);
  await page.reload();
  await expect(page.locator(".game-outcome")).toContainText("黑方吃子达标获胜");
  expect(await page.evaluate(() => window.victories)).toBe(0);
  await page.getByRole("button", { name: "音乐设置", exact: true }).click();
  await page.getByRole("checkbox", { name: "胜利音乐", exact: true }).uncheck();
  await page.reload();
  await page.getByRole("button", { name: "音乐设置", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "胜利音乐", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "关闭音乐设置", exact: true }).click();
  await page.getByRole("button", { name: "悔棋", exact: true }).click();
  await page.getByRole("button", { name: "练习", exact: true }).click();
  await page.getByRole("button", { name: "A4", exact: true }).dblclick();
  await expect(page.locator(".game-outcome")).toContainText("黑方吃子达标获胜");
  expect(await page.evaluate(() => window.victories)).toBe(0);
  await expect(
    page.getByRole("button", { name: "关闭落子音效", exact: true }),
  ).toBeVisible();
});

test("AI pass opens scoring, dead stones change score, resume and confirmed result persist", async ({
  page,
}) => {
  const seen = [];
  await page.route("**/api/analyze", async (route) => {
    const body = route.request().postDataJSON();
    seen.push(body);
    await route.fulfill({
      json: {
        id: "test-pass",
        status: "completed",
        results: [
          {
            turnNumber: body.moves.length,
            rootInfo: {
              currentPlayer: "W",
              scoreLead: -7.5,
              winrate: 0.2,
              visits: 32,
            },
            moveInfos: [
              {
                move: "pass",
                order: 0,
                scoreLead: -7.5,
                winrate: 0.2,
                visits: 32,
                pv: ["pass"],
              },
            ],
          },
        ],
      },
    });
  });
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await page.getByLabel("棋盘", { exact: true }).selectOption("5");
  await page
    .getByLabel("新局 AI 强度", { exact: true })
    .selectOption("starter");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await page.getByRole("button", { name: "停一手", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "终局计分 · 确认死子" });
  await expect(modal).toBeVisible();
  await expect(modal.locator(".score-total")).toContainText("白方胜 7.5 目");
  expect(seen[0].maxVisits).toBe(32);
  await modal.getByRole("button", { name: "继续下棋", exact: true }).click();
  await expect(page.locator(".move-counter")).toHaveText("0 / 0");
  await page.getByLabel("AI 强度", { exact: true }).selectOption("expert");
  await page.getByRole("button", { name: "停一手", exact: true }).click();
  await expect(modal).toBeVisible();
  expect(seen.at(-1).maxVisits).toBe(6000);
  await modal
    .getByRole("button", { name: "确认死子与结果", exact: true })
    .click();
  await expect(page.locator(".game-outcome")).toContainText("白方胜 7.5 目");
  await expect(page.locator(".document-title")).toContainText("已保存");
  await page.reload();
  await expect(page.locator(".game-outcome")).toContainText("白方胜 7.5 目");

  await page.request.post("/api/games", {
    data: {
      record: {
        size: 5,
        title: "死子验收",
        komi: 0.5,
        initialStones: [
          ["B", "B1"],
          ["W", "A1"],
        ],
        moves: [
          ["B", "pass"],
          ["W", "pass"],
        ],
      },
    },
  });
  await page.getByRole("button", { name: "刷新棋局", exact: true }).click();
  await page.locator(".history-game").filter({ hasText: "死子验收" }).click();
  await page.getByRole("button", { name: "终局计分", exact: true }).click();
  await modal.getByRole("button", { name: "A1", exact: true }).click();
  await expect(modal.locator(".score-total")).toContainText("黑方胜 24.5 目");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.screenshot({
    path: "test-results/scoring-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await modal.getByRole("button", { name: "A1", exact: true }).click();
  await expect(
    modal.getByRole("button", { name: "A1", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});
