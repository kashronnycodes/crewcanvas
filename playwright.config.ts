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
    { command: "npm run dev -- --port 3101 --strictPort", url: "http://127.0.0.1:3101", reuseExistingServer: false, env: { VITE_APP_MODE: "integrated", VITE_SUPABASE_URL: "https://rate-test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-browser-test-key" } },
    { command: "npm run dev -- --port 3201 --strictPort", url: "http://127.0.0.1:3201", reuseExistingServer: false, env: { VITE_APP_MODE: "integrated", VITE_SUPABASE_URL: "https://rate-test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-browser-test-key" } },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.CREW_BROWSER_CHANNEL } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 5"], channel: process.env.CREW_BROWSER_CHANNEL } },
    { name: "Mobile Safari", use: { ...devices["iPhone 12"] } },
  ],
});
