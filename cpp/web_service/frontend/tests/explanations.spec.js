import { test, expect } from "@playwright/test";
import {
  compareMove,
  gameReview,
  positionExplanation,
} from "../src/explanations.js";

test("learning comparisons use the moving player's perspective", () => {
  const analysis = {
    moveInfos: [
      { order: 1, move: "B2", scoreLead: 3 },
      { order: 0, move: "C3", scoreLead: 1 },
    ],
  };
  expect(compareMove(analysis, "B2", "W").loss).toBe(2);
  expect(compareMove(analysis, "B2", "B").loss).toBe(-2);
  expect(compareMove(analysis, "A1", "W")).toBeNull();
  const record = {
    moves: [
      ["B", "A1"],
      ["W", "B2"],
    ],
    analyses: { 0: analysis, 1: analysis },
  };
  expect(gameReview(record)).toEqual({
    compared: 1,
    mistakes: [{ turn: 2, player: "W", move: "B2", best: "C3", loss: 2 }],
  });
});

test("learning text distinguishes pass, probability and board coordinates", () => {
  const record = { size: 19, moves: [], initialPlayer: "W" };
  const analysis = {
    rootInfo: { scoreLead: -2.5, winrate: 0.1 },
    moveInfos: [
      { order: 0, move: "T19", pv: ["T19", "pass"], scoreLead: -2.5 },
    ],
  };
  const text = positionExplanation(record, 0, analysis).join(" ");
  expect(text).toContain("白棋预计领先 2.5 目");
  expect(text).toContain("不是棋盘占地比例");
  expect(text).toContain("最近边界第 1 线");
  expect(text).toContain("白棋 T19 → 黑棋 停一手");
  analysis.moveInfos[0].move = "pass";
  expect(positionExplanation(record, 0, analysis).join(" ")).toContain(
    "停着不等于认输",
  );
  expect(positionExplanation(record, 0, null)).toEqual([]);
});
