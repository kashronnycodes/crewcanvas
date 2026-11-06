// Browser UX only: synthetic Auth/API responses; backend enforcement is covered
// by Edge handler tests and independent-session PostgreSQL tests.
import { expect, test, type Page } from "@playwright/test";
import { seedWorkspace } from "../shared/seed";
const authId = "60000000-0000-4000-8000-000000000001";
async function workspace(page: Page) {
  const seed = seedWorkspace();
  await page.addInitScript(({ authId }) => {
    const token = btoa(JSON.stringify({ alg: "none" })) + "." + btoa(JSON.stringify({ sub: authId, exp: Math.floor(Date.now()/1000)+3600 })) + ".synthetic";
    localStorage.setItem("sb-rate-test-auth-token", JSON.stringify({ access_token: token, refresh_token: "synthetic-refresh", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, token_type: "bearer", user: { id: authId, email: "synthetic@example.com" } }));
  }, { authId });
  await page.route("https://rate-test.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/settings")) return route.fulfill({ json: { disable_signup: true } });
    if (url.pathname.endsWith("/workspaces")) return route.fulfill({ json: [{ id: seed.actorId, workspace_id: seed.id, access_role: "employer", workspaces: { id: seed.id, name: seed.name, timezone: seed.timezone } }] });
    if (url.pathname.endsWith("/snapshot")) return route.fulfill({ json: seed });
    return route.fulfill({ status: 429, headers: { "Retry-After": "27", "Access-Control-Expose-Headers": "Retry-After" }, json: { ok: false, code: "RATE_LIMIT_EXCEEDED", error: { message: "Too many requests. Please try again shortly." } } });
  });
  await page.goto("http://127.0.0.1:3201/");
  await expect(page.getByRole("button", { name: "Projects", exact: true })).toBeVisible();
}
test("AI throttling displays retry guidance and restores the action", async ({ page }) => {
  await workspace(page);
  await page.getByRole("button", { name: "Work map", exact: true }).click();
  await page.getByLabel("Ask your workspace", { exact: true }).fill("Summarize project progress");
  await page.getByRole("button", { name: "Run workspace command" }).click();
  await expect(page.getByText("Too many requests. Please try again in 27 seconds.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run workspace command" })).toBeEnabled();
});
test("payment rate errors keep status/retry information and make one attempt", async ({ page }) => {
  let attempts = 0;
  page.on("request", request => { if (request.url().endsWith("/payments/issue")) attempts++; });
  await workspace(page);
  const result = await page.evaluate(async () => {
    const path = "/src/services.ts";
    const { api } = await import(path);
    try { await api("payments/issue", { projectId: "50000000-0000-4000-8000-000000000001" }, "70000000-0000-4000-8000-000000000001"); }
    catch (error) { const value = error as Error & { status: number; retryAfter: number }; return { message: value.message, status: value.status, retryAfter: value.retryAfter }; }
  });
  expect(result).toEqual({ message: "Too many requests. Please try again in 27 seconds.", status: 429, retryAfter: 27 });
  expect(attempts).toBe(1);
});
