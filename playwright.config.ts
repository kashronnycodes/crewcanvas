import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "**/integrated/**",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 3,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: [
    { command: "npm run dev -- --port 3100 --strictPort", url: "http://127.0.0.1:3100", reuseExistingServer: false, env: { VITE_APP_MODE: "demo" } },
    { command: "npm run dev -- --port 3101 --strictPort", url: "http://127.0.0.1:3101", reuseExistingServer: false, env: { VITE_APP_MODE: "integrated" } },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 12"] } },
  ],
});
