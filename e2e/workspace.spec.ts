import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("primary navigation and the about dialog return to the expected view", async ({ page }, testInfo) => {
  await expect(
    page.getByRole("region", { name: "Project collaboration studio" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Revisions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revisions, in one place." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Work map", exact: true }).click();
  await expect(page.getByLabel("Pan tool", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.locator(".people-list")).toBeVisible();

  await page.getByRole("button", { name: "Project whiteboard" }).click();
  await expect(
    page.getByLabel("Project collaboration whiteboard"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Project studio", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Project collaboration studio" }),
  ).toBeVisible();

  if (!testInfo.project.name.startsWith("Mobile")) {
    await page.getByRole("button", { name: "About CrewCanvas" }).click();
    const about = page.getByRole("dialog", {
      name: "A clearer picture of your creative team",
    });
    await expect(about).toBeVisible();
    await about.getByRole("button", { name: "Back to the canvas" }).click();
    await expect(about).toHaveCount(0);
  }
});

test("shows workers only their assigned projects", async ({ page }) => {
  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jacob · Worker",
  });
  await page.getByRole("button", { name: "Projects", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Your work, clearly in view." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Recruitment cut", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Podcast highlights", exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Recruitment cut", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Recruitment cut");
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
});

test("creates a project and displays deterministic demo brief suggestions", async ({ page }) => {
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("E2E campaign video");
  await page.getByLabel("The brief").fill(
    "Create a short campaign video with captions and a final export.",
  );
  await page.getByRole("button", { name: "Suggest tasks & deliverables" })
    .click();

  await expect(page.getByText("DETERMINISTIC DEMO RESPONSE")).toBeVisible();
  await page.getByRole("button", {
    name: /Use proposed tasks & deliverables/,
  }).click();
  await expect(
    page.getByPlaceholder("Plan the edit\nPrepare the final export"),
  ).toHaveValue(/Review and prepare/);
});

test("completes agreement, delivery review, and persists the accepted result", async ({ page }) => {
  const projectName = "E2E delivery lifecycle";

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("The brief").fill(
    "Create a campaign clip and deliver one final video export.",
  );
  await page.getByRole("textbox", { name: /Deliverables/ }).fill(
    "One final campaign video",
  );
  await page.getByRole("button", { name: "Propose agreement" }).click();

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jacob · Worker",
  });
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await page.getByRole("button", { name: "Accept agreement" }).click();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Deliverables" }).click();
  await page.getByLabel("Submission source").selectOption("link");
  await page.getByLabel("Google Drive or Docs link").fill(
    "https://drive.google.com/file/d/e2e-campaign-video",
  );
  await page.getByLabel("Version label").fill("v1 · final campaign video");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Awaiting review", { exact: true })).toBeVisible();

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Myron · Employer",
  });
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await page.getByRole("tab", { name: "Deliverables" }).click();
  await page.getByRole("button", { name: "Approve Work" }).click();
  await expect(page.getByText("Work accepted", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await expect(page.getByText("Work accepted", { exact: true })).toBeVisible();
});
