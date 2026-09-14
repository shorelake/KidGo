import { test, expect } from "@playwright/test";
import { createStoneBuffer } from "../src/stoneSound.js";

test("stone impact has a short audible attack and quiet tail without clipping", () => {
  const buffer = createStoneBuffer({
    sampleRate: 48000,
    createBuffer: (channels, length) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
  });
  const data = buffer.getChannelData(0);
  const rms = (samples) =>
    Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
  expect(data.length).toBe(7200);
  expect(Math.max(...data.map(Math.abs))).toBeLessThan(0.73);
  expect(rms(data.slice(0, 1440))).toBeGreaterThan(0.05);
  expect(rms(data.slice(-1440))).toBeLessThan(0.005);
});
import {
  chooseBotMove,
  practiceResult,
  levels,
  resultLabel,
} from "../src/gameplay.js";

test("practice wins require a net capture lead for either side", () => {
  expect(practiceResult({ B: 3, W: 2 }, 3)).toBe("");
  expect(practiceResult({ B: 3, W: 2 }, 1)).toBe("B+Capture");
  expect(practiceResult({ B: 2, W: 5 }, 3)).toBe("W+Capture");
  expect(practiceResult({ B: 8, W: 0 }, 0)).toBe("");
  expect(resultLabel("W+Capture")).toContain("吃子达标");
  expect(resultLabel("B+2.5")).toBe("黑方胜 2.5 目");
});

test("difficulty selection respects color, loss budget, passes and strongest play", () => {
  const result = {
    rootInfo: { currentPlayer: "W" },
    moveInfos: [
      { move: "C3", order: 0, scoreLead: -2 },
      { move: "B3", order: 1, scoreLead: 2 },
      { move: "A1", order: 2, scoreLead: 30 },
      { move: "pass", order: 3, scoreLead: -3 },
    ],
  };
  expect(chooseBotMove(result, "starter", () => 0.99)).toBe("B3");
  expect(chooseBotMove(result, "standard", () => 0.99)).toBe("C3");
  expect(chooseBotMove(result, "expert", () => 0.99)).toBe("C3");
  result.moveInfos[0].move = "pass";
  expect(chooseBotMove(result, "starter")).toBe("pass");
  expect(Object.values(levels).map((level) => level.visits)).toEqual([
    32, 128, 500, 2000, 6000,
  ]);
});
