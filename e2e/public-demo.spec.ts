import { expect, test, type Page } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../shared/publicDemo";

async function login(page: Page, index: number) {
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: `Use this account: ${DEMO_ACCOUNTS[index].name}`, exact: true }).click();
  await expect(page.getByLabel("Demo viewing role")).toHaveValue(DEMO_ACCOUNTS[index].id);
  await expect(page.getByText("Interactive demo", { exact: false }).first()).toBeVisible();
}
async function projects(page: Page) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
}
for (const [index, account] of DEMO_ACCOUNTS.entries()) {
  test(`${account.name} enters with the correct role and survives refresh`, async ({ page }) => {
    await login(page, index);
    if (index) await expect(page.getByRole("button", { name: "New project" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("Demo viewing role")).toHaveValue(account.id);
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  });
}
test("logout, switch accounts, and enforce assigned project visibility", async ({ page }) => {
  await login(page, 1);
  await projects(page);
  await expect(page.getByRole("button", { name: "Thumbnails", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Podcast highlights", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explore CrewCanvas" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Use this account: Freelancer Demo 2", exact: true }).click();
  await projects(page);
  await expect(page.getByRole("button", { name: "Podcast highlights", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thumbnails", exact: true })).toHaveCount(0);
});
test("employer assignment becomes an authentic freelancer agreement and submission", async ({ page }) => {
  await login(page, 0);
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Judge campaign");
  await page.getByLabel("Assigned to").selectOption(DEMO_ACCOUNTS[1].id);
  await page.getByLabel("The brief").fill("Create a launch poster with one approved visual direction.");
  await page.getByRole("textbox", { name: /Deliverables/ }).fill("Launch poster export");
  await page.getByRole("button", { name: "Propose agreement" }).click();
  await page.getByLabel("Demo viewing role").selectOption(DEMO_ACCOUNTS[2].id);
  await projects(page);
  await expect(page.getByRole("button", { name: "Judge campaign", exact: true })).toHaveCount(0);
  await page.getByLabel("Demo viewing role").selectOption(DEMO_ACCOUNTS[1].id);
  await page.getByRole("button", { name: "Judge campaign", exact: true }).click();
  await page.getByRole("button", { name: "Accept agreement", exact: true }).click();
  await page.getByRole("tab", { name: "Deliverables" }).click();
  await page.getByLabel("Submission source").selectOption("link");
  await page.getByLabel("Google Drive or Docs link").fill("https://drive.google.com/file/d/synthetic-judge-delivery");
  await page.getByLabel("Version label").fill("v1");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeEnabled();
  await expect(page.getByText("v1", { exact: true })).toBeVisible();
});
test("seeded revision fee can be accepted and the file opens", async ({ page }) => {
  await login(page, 0);
  await projects(page);
  await page.getByRole("button", { name: "Thumbnails", exact: true }).click();
  await page.getByRole("tab", { name: "Revisions" }).click();
  await expect(page.getByText("Five thumbnails in an additional visual direction", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Accept proposal" }).click();
  await expect(page.getByRole("button", { name: "Accept proposal" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Deliverables" }).click();
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "campaign-deliverable.txt · v1" }).click();
  const file = await popup;
  await expect(file.locator("body")).toContainText("CrewCanvas synthetic campaign deliverable");
});
test("integrated sign-in exposes simulation choices and preserves invalid credential errors", async ({ page }) => {
  await page.route("**/auth/v1/settings", route => route.fulfill({ json: { disable_signup: true } }));
  await page.route("**/auth/v1/token?grant_type=password", route => route.fulfill({ status: 400, json: { error: "invalid_grant", error_description: "Invalid login credentials" } }));
  await page.goto("http://127.0.0.1:3101/");
  await expect(page.getByRole("heading", { name: "Explore CrewCanvas" })).toBeVisible();
  await page.getByLabel("Email address").fill("invalid@example.com");
  await page.getByLabel("Password", { exact: true }).fill("invalid-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid login credentials");
  await page.getByRole("link", { name: "Use this account: Employer Demo", exact: true }).click();
  await expect(page.getByLabel("Demo viewing role")).toHaveValue(DEMO_ACCOUNTS[0].id);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
});
test("mobile layout and dark mode retain accessible account choices", async ({ page }) => {
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const account of DEMO_ACCOUNTS) await expect(page.getByRole("button", { name: `Use this account: ${account.name}`, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
