import { expect, test } from "@playwright/test";

test("loads the demo workspace and opens the project whiteboard", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Interactive demo")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "People. Projects. Possibilities." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Project whiteboard" }).click();
  await expect(page.getByLabel("Project collaboration whiteboard")).toBeVisible();
});

