import { test, expect } from "@playwright/test";
import { createVictoryBuffer, isHumanVictory } from "../src/victoryMusic.js";

test("victory music is audible, short, unclipped and fades out", () => {
  const buffer = createVictoryBuffer({
    sampleRate: 22050,
    createBuffer: (channels, length) => {
      const samples = new Float32Array(length);
      return { getChannelData: () => samples };
    },
  });
  const data = buffer.getChannelData(0);
  const rms = (samples) =>
    Math.sqrt(
      samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
    );
  expect(data.length).toBe(110250);
  expect(
    data.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
  ).toBeLessThan(0.66);
  expect(rms(data.slice(66150, 99225))).toBeGreaterThan(0.03);
  expect(rms(data)).toBeGreaterThan(0.03);
  expect(rms(data.slice(-2205))).toBeLessThan(0.003);
});

test("only a new human win in play or practice celebrates", () => {
  expect(isHumanVictory("B+Capture", "B", "practice")).toBe(true);
  expect(isHumanVictory("W+2.5", "W", "play")).toBe(true);
  expect(isHumanVictory("W+2.5", "B", "play")).toBe(false);
  expect(isHumanVictory("B+R", "B", "review")).toBe(false);
  expect(isHumanVictory("0", "B", "practice")).toBe(false);
  expect(isHumanVictory("B+3.5", "B", "play", "B+3.5")).toBe(false);
});
