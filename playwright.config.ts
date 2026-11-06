import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", fullyParallel: true, workers: 3,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]], use: { baseURL: "http://127.0.0.1:3200", trace: "retain-on-failure" },
  webServer: [
    { command: "npm run dev -- --port 3200 --strictPort", url: "http://127.0.0.1:3200", env: { VITE_APP_MODE: "demo" } },
    { command: "npm run dev -- --port 3201 --strictPort", url: "http://127.0.0.1:3201", env: { VITE_APP_MODE: "integrated", VITE_SUPABASE_URL: "https://rate-test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-browser-test-key" } },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Chrome", testMatch: "**/rate-limits.spec.ts", use: { ...devices["Pixel 5"] } },
    { name: "Mobile Safari", testMatch: "**/rate-limits.spec.ts", use: { ...devices["iPhone 12"] } },
  ],
});
