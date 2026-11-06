import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e/integrated", workers: 1,
  use: { baseURL: process.env.CREW_E2E_BASE_URL, ...devices["Desktop Chrome"] },
});
