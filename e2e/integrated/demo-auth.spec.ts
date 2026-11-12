import { expect, test } from "@playwright/test";
test.skip(!process.env.CREW_E2E_BASE_URL || !process.env.CREW_DEMO_PASSWORD, "Requires a provisioned, dedicated Supabase demo deployment; never target the current shared backend.");
for (const key of ["employer", "freelancer-1", "freelancer-2"]) {
  test(`real Supabase session: ${key}, refresh and logout`, async ({ page }) => {
    const generation = process.env.CREW_DEMO_GENERATION ?? "1";
    await page.goto("/");
    await page.getByLabel("Email address").fill(`crewcanvas.public-demo.g${generation}.${key}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill(process.env.CREW_DEMO_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Workspace menu", exact: true })).toBeVisible();
    if (key !== "employer") await expect(page.getByRole("button", { name: "New project", exact: true })).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Workspace menu", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByLabel("Email address")).toBeVisible();
  });
}
