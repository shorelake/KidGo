import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const cache = join(homedir(), ".cache/ms-playwright");
const cached = existsSync(cache)
  ? readdirSync(cache)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort()
      .reverse()
      .map((n) => join(cache, n, "chrome-linux64/chrome"))
      .find(existsSync)
  : undefined;
export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.KATAGO_TEST_URL || "http://127.0.0.1:3000",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || cached,
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
