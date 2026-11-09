import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { closePanels, openTask } from "./helpers";

test(
  "member task form, general assignment, shared whiteboard and browser Back",
  async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (info.project.name === "chromium") {
      await page.setViewportSize({ width: 1440, height: 1100 });
    }
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Work map", exact: true }))
      .toHaveCount(0);
    await page.getByLabel("Search people and projects").fill("Recruitment cut");
    await page.getByRole("button", { name: "Recruitment cut", exact: true })
      .click();
    await page.getByRole("button", { name: /^Open role / }).click();
    await page.getByRole("button", { name: /^Open member / }).click();
    const memberHeading = await page.getByRole("dialog").getByRole("heading")
      .first().textContent();
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Project", exact: true }))
      .toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Role", exact: true }))
      .toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Assigned member" }))
      .toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Agreement", exact: true }))
      .toHaveCount(0);
    await expect(page.getByRole("dialog")).toContainText(
      "Assigned to jacob jaun da goat",
    );
    await page.getByLabel("Task title").fill("Member export task");
    await page.getByLabel("Description", { exact: true }).fill(
      "Prepare the final member-specific export.",
    );
    await page.getByLabel("Proposed task price · USD").fill("19.99");
    if (info.project.name === "chromium") {
      mkdirSync("docs/screenshots", { recursive: true });
      await page.screenshot({
        path: "docs/screenshots/member-task-form.png",
        animations: "disabled",
      });
    }
    await page.getByRole("button", { name: "Save task" }).click();
    await expect(page.getByRole("heading", { name: memberHeading! }))
      .toBeVisible();
    await expect(
      page.getByRole("button", { name: "Member export task", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Member export task", exact: true })
      .click();
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByLabel("Task payment responsibilities"))
      .toContainText("Not accepted yet");
    const length = await page.evaluate(() => history.length);
    await page.getByRole("button", { name: "← Back to member tasks" }).click();
    await expect(page.getByRole("heading", { name: memberHeading! }))
      .toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: /· members$/ }))
      .toBeVisible();
    await page.getByRole("button", { name: "← Back to project roles" }).click();
    await expect(page.getByRole("heading", { name: "Project roles" }))
      .toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Search people and projects")).toHaveValue(
      "Recruitment cut",
    );
    expect(await page.evaluate(() => history.length)).toBe(length);
    await page.getByLabel("Search people and projects").clear();
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await page.getByLabel("Assigned member").selectOption({
      label: "vincent damaso da best · Hackathon Game Winners",
    });
    await page.getByRole("combobox", { name: "Project", exact: true })
      .selectOption({ label: "Recruitment cut" });
    await page.getByLabel("Task title").fill("General assigned task");
    await page.getByLabel("Description", { exact: true }).fill(
      "Prepare a separate export for the second member.",
    );
    await page.getByRole("button", { name: "Save task" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    if (info.project.name === "chromium") {
      mkdirSync("docs/screenshots", { recursive: true });
      await page.screenshot({
        path: "docs/screenshots/project-studio.png",
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.reload();
    await page.getByRole("button", { name: "Project whiteboard", exact: true })
      .click();
    await expect(
      page.locator(".hierarchy-card").filter({ hasText: "Member export task" }),
    ).toHaveCount(1);
    await expect(
      page.locator(".hierarchy-card").filter({
        hasText: "General assigned task",
      }),
    ).toHaveCount(1);
    await page.getByLabel("Search people and projects").fill("Recruitment cut");
    if (info.project.name === "chromium") {
      await page.getByLabel("Project hierarchy whiteboard").screenshot({
        path: "docs/screenshots/project-whiteboard.png",
        animations: "disabled",
      });
    }
    const memberCard = page.locator(".hierarchy-card").filter({
      hasText: "vincent damaso da best",
    });
    await memberCard.getByRole("button").click();
    await expect(
      page.getByRole("button", { name: "General assigned task", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "General assigned task", exact: true }),
    ).toBeVisible();
    await closePanels(page);
    expect(errors).toEqual([]);
  },
);

test(
  "revisions group by member, counteroffers preserve price until accepted, and payment stays unpaid",
  async ({ page }, info) => {
    if (info.project.name === "chromium") {
      await page.setViewportSize({ width: 1440, height: 1100 });
    }
    await page.goto("/");
    await page.getByRole("button", { name: "Revisions", exact: true }).click();
    await expect(
      page.locator(".revisions-members").getByRole("heading", {
        name: "Ethan Lim",
      }),
    ).toBeVisible();
    if (info.project.name === "chromium") {
      mkdirSync("docs/screenshots", { recursive: true });
      await page.getByLabel("Search people and projects").fill("Thumbnails");
      await page.screenshot({
        path: "docs/screenshots/revisions.png",
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.getByLabel("Search people and projects").clear();
    await page.locator(".studio-task").filter({ hasText: "Thumbnails" })
      .getByRole("button", { name: "Deliverable & revision details →" })
      .click();
    await expect(page.getByRole("tab", { name: "Revisions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("button", { name: "Counteroffer", exact: true })
      .click();
    await page.getByLabel("Counteroffer price · USD").fill("15.00");
    await page.getByLabel("Explanation (optional)").fill(
      "Keep this to one additional direction.",
    );
    await page.getByRole("button", { name: "Send counteroffer" }).click();
    await expect(
      page.getByText("Awaiting freelancer response", { exact: false }),
    ).toBeVisible();
    const stored = () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("crewcanvas.demo.v1")!).projects.find((
          p: { title: string },
        ) => p.title === "Thumbnails")
      );
    const pending = await stored();
    expect(
      pending.agreements.find((a: { id: string }) =>
        a.id === pending.activeAgreementId
      ).amountMinor,
    ).toBe("8000");
    await page.getByLabel("Demo viewing role").selectOption({
      label: "Ethan · Worker",
    });
    await openTask(page, "Thumbnails");
    await page.getByRole("tab", { name: "Revisions" }).click();
    await expect(page.getByRole("button", { name: "Decline", exact: true }))
      .toHaveCount(0);
    await page.getByRole("button", { name: "Counteroffer", exact: true })
      .click();
    await page.getByLabel("Counteroffer price · USD").fill("17.50");
    await page.getByRole("button", { name: "Send counteroffer" }).click();
    await page.getByLabel("Demo viewing role").selectOption({
      label: "Myron · Employer",
    });
    await openTask(page, "Thumbnails");
    await page.getByRole("tab", { name: "Revisions" }).click();
    await page.getByRole("button", { name: "Accept proposed price" }).click();
    const accepted = await stored();
    expect(
      accepted.agreements.find((a: { id: string }) =>
        a.id === accepted.activeAgreementId
      ).amountMinor,
    ).toBe("9750");
    expect(accepted.proposals.map((p: { status: string }) => p.status)).toEqual(
      ["superseded", "superseded", "accepted"],
    );
    expect(accepted.invoices).toEqual([]);
    await page.getByRole("tab", { name: "Payments" }).click();
    await expect(page.getByLabel("Task payment responsibilities"))
      .toContainText("$17.50");
    await expect(page.getByRole("link", { name: /Pay now/ })).toHaveCount(0);
    if (info.project.name === "chromium") {
      await page.screenshot({
        path: "docs/screenshots/task-payments.png",
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.reload();
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    if (info.project.name === "chromium") {
      await page.screenshot({
        path: "docs/screenshots/studio-dark.png",
        fullPage: true,
        animations: "disabled",
      });
    }
  },
);

test("workspace AI remains available to freelancers and cannot expose peer work", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jacob · Worker",
  });
  await expect(page.getByRole("button", { name: "Add task", exact: true }))
    .toHaveCount(0);
  await page.getByText("✦ Workspace AI · progress, payments and next steps", {
    exact: true,
  }).click();
  await page.getByLabel("Workspace AI question").fill("Summarize my work");
  await page.getByRole("button", { name: "Ask workspace AI", exact: true })
    .click();
  await expect(page.getByText("Simulated demo response", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Project whiteboard", exact: true })
    .click();
  await expect(
    page.locator(".hierarchy-card").filter({ hasText: "Podcast highlights" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".hierarchy-card").filter({ hasText: "Recruitment cut" }),
  ).toHaveCount(2);
});
