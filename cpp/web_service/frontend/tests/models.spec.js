import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function login(request) {
  const token = (
    await readFile(new URL("../../data/access.token", import.meta.url), "utf8")
  ).trim();
  expect((await request.post("/api/login", { data: { token } })).ok()).toBe(
    true,
  );
}

async function analyze(request, data) {
  const response = await request.post("/api/analyze", {
    data,
    timeout: 240000,
  });
  expect(response.status(), await response.text()).toBe(202);
  let job = await response.json();
  const deadline = Date.now() + 150000;
  while (job.status === "running" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    job = await (await request.get(`/api/analyze/${job.id}`)).json();
  }
  expect(job.status, JSON.stringify(job)).toBe("completed");
  return job.results.at(-1);
}

test("three CUDA models and Human SL ranks produce legal small-board moves", async ({
  request,
}) => {
  test.setTimeout(600000);
  await login(request);
  for (const opponentModel of ["L9", "L6", "L2", "human"]) {
    for (const size of [5, 7, 11, 15, 19]) {
      for (const humanRank of opponentModel === "human"
        ? ["rank_20k", "rank_9d"]
        : ["rank_20k"]) {
        const position = { size, moves: [["B", "C3"]] };
        const result = await analyze(request, {
          ...position,
          purpose: "play",
          opponentModel,
          humanRank,
          maxVisits: 64,
          avoidEarlyPass: true,
        });
        expect(result.provenance.modelId).toBe(opponentModel);
        const move =
          opponentModel === "human"
            ? result.selectedMove
            : result.moveInfos[0].move;
        if (size <= 7) expect(move).not.toBe("pass");
        const legal = await request.post("/api/position", {
          data: { ...position, moves: [...position.moves, ["W", move]] },
        });
        expect(
          legal.ok(),
          `${opponentModel} ${humanRank} ${size} ${move}: ${await legal.text()}`,
        ).toBe(true);
        console.log(`${opponentModel} ${humanRank} ${size}x${size}: ${move}`);
      }
    }
  }
  const teacher = await analyze(request, {
    size: 5,
    opponentModel: "L2",
    maxVisits: 32,
    analyzeTurns: [0, 1],
    moves: [["B", "C3"]],
  });
  expect(teacher.provenance.modelId).toBe("L9");
  expect(teacher.provenance.purpose).toBe("analysis");
});

test("model selectors, rank persistence and teacher-only hints on desktop and phone", async ({
  page,
}) => {
  test.setTimeout(180000);
  await login(page.request);
  await page.goto("/");
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "新建棋局", exact: true }).click();
  await expect(page.getByLabel("新局 对手模型", { exact: true })).toHaveValue(
    "human",
  );
  await expect(page.getByLabel("新局 陪练段位").locator("option")).toHaveCount(
    29,
  );
  await page.getByLabel("新局 陪练段位").selectOption("rank_9d");
  await expect(page.getByLabel("新局 对手模型").locator("option")).toHaveCount(
    4,
  );
  await page.getByLabel("新局 对手模型").selectOption("L2");
  await expect(page.getByLabel("新局 AI 强度")).toBeEnabled();
  await page.getByLabel("新局 对手模型").selectOption("human");
  await expect(page.getByLabel("新局 AI 强度")).toBeDisabled();
  await page.getByLabel("棋盘", { exact: true }).selectOption("5");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByLabel("陪练段位", { exact: true })).toHaveValue(
    "rank_9d",
  );
  await page.getByRole("button", { name: "C3", exact: true }).click();
  await page.getByRole("button", { name: "C3", exact: true }).click();
  await expect(page.locator(".timeline")).toHaveAttribute("max", "2", {
    timeout: 90000,
  });
  await expect(page.locator(".recommendation-marker").first()).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".analysis-source")).toHaveText("老师 L9", {
    timeout: 30000,
  });
  await page.screenshot({
    path: "test-results/models-desktop.png",
    fullPage: true,
  });
  await page.waitForTimeout(1800);
  await page.reload();
  await page.getByRole("button", { name: "对弈", exact: true }).click();
  await expect(page.getByLabel("陪练段位", { exact: true })).toHaveValue(
    "rank_9d",
  );
  const games = await (await page.request.get("/api/games")).json();
  const saved = await (
    await page.request.get(`/api/games/${games[0].id}`)
  ).json();
  expect(saved.record.opponentModel).toBe("human");
  expect(saved.record.humanRank).toBe("rank_9d");
  expect(saved.record.analyses[2].provenance.modelId).toBe("L9");
  expect(saved.record.analyses[1]).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/models-phone.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
