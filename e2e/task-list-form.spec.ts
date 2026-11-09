import { expect, test } from "@playwright/test";

test("task list assigns into a saved board project and fixes member context", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New board project", exact: true })
    .click();
  await page.getByLabel("Project title").fill("Assignment review");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Studio project")).toContainText(
    "Assignment review",
  );
  await page.getByRole("button", { name: "Task list", exact: true }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("combobox", { name: "Project", exact: true })
    .selectOption({ label: "Assignment review" });
  await page.getByRole("combobox", { name: "Assigned to", exact: true })
    .selectOption("20000000-0000-4000-8000-000000000003");
  await page.getByLabel("Task title").fill("Task list export");
  await page.getByLabel("The brief").fill(
    "Create an export within the selected board project.",
  );
  await page.getByRole("textbox", { name: /Deliverables/ }).fill("One export");
  await page.getByRole("button", { name: "Create task & propose terms" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const project = page.locator(".studio-project").filter({
    has: page.getByRole("button", { name: "Assignment review", exact: true }),
  });
  await project.getByRole("button", { name: /^Open member vincent/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Task list export");
  await page.getByRole("dialog").getByRole("button", {
    name: "Add task",
    exact: true,
  }).click();
  await expect(page.getByRole("combobox", { name: "Assigned to", exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Project", exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("dialog")).toContainText("Assigned to vincent");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Task list export");
  await page.reload();
  await page.getByLabel("Studio project").selectOption({
    label: "Assignment review",
  });
  await page.getByRole("button", { name: "Project whiteboard", exact: true })
    .click();
  await expect(page.getByLabel("Task whiteboard")).toContainText(
    "Task list export",
  );
});
