import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { closePanels, openTask } from "./helpers";

test(
  "reference canvas shares navigation, fixed member forms, assignments and whiteboard tasks",
  async ({ page }, info) => {
    if (info.project.name === "chromium") {
      await page.setViewportSize({ width: 1440, height: 1100 });
    }
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Work map", exact: true }))
      .toHaveCount(0);
    await page.getByLabel("Search people and projects").fill("Recruitment cut");
    const fixture = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("crewcanvas.demo.v1")!);
      const t = s.projects.find((p: { title: string }) =>
        p.title === "Recruitment cut"
      );
      return s.people.find((p: { id: string }) => p.id === t.workerId);
    });
    if ((page.viewportSize()?.width ?? 1440) < 760) {
      await page.getByLabel(`Open role ${fixture.role}`, { exact: true })
        .click();
    } else {await page.locator(".hierarchy-role").getByRole("button", {
        name: fixture.role,
        exact: true,
      }).click();}
    await page.locator(".roster-member").filter({ hasText: fixture.name })
      .click();
    const member = page.getByRole("complementary", { name: "Member tasks" });
    await member.getByRole("button", { name: "+ Add task", exact: true })
      .click();
    await expect(page.getByRole("combobox", { name: "Project", exact: true }))
      .toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Project role", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Assigned to", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Agreement", exact: true }))
      .toHaveCount(0);
    await expect(page.getByRole("dialog")).toContainText(
      `Assigned to ${fixture.name}`,
    );
    if (info.project.name === "chromium") {
      await page.screenshot({
        path: info.outputPath("merged-member-form.png"),
        fullPage: true,
      });
    }
    await page.getByLabel("Task title").fill("Member export task");
    await page.getByLabel("The brief").fill(
      "Prepare the final member-specific export.",
    );
    await page.getByRole("textbox", { name: /Deliverables/ }).fill(
      "One final MP4",
    );
    await page.getByRole("button", { name: "Create task & propose terms" })
      .click();
    await expect(member).toBeVisible();
    await page.getByLabel("Search people and projects").clear();
    await member.getByRole("button", {
      name: "Member export task",
      exact: true,
    }).click();
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByLabel("Task payment responsibilities"))
      .toContainText("Not accepted yet");
    await page.getByRole("button", { name: "← Back to member tasks" }).click();
    await expect(member).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("complementary", { name: "Role roster" }))
      .toBeVisible();
    await page.getByRole("button", { name: "← Back to project roles" }).click();
    await expect(
      page.getByRole("complementary", { name: "Project roles directory" }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("complementary", { name: "Project roles directory" }),
    ).toHaveCount(0);
    await page.locator(".workflow-heading").getByRole("button", {
      name: "+ Add task",
      exact: true,
    }).click();
    await page.getByRole("combobox", { name: "Assigned to", exact: true })
      .selectOption("20000000-0000-4000-8000-000000000003");
    await page.getByLabel("Task title").fill("General assigned task");
    await page.getByLabel("The brief").fill(
      "A second export for another eligible member.",
    );
    await page.getByRole("textbox", { name: /Deliverables/ }).fill(
      "Second final export",
    );
    await page.getByRole("button", { name: "Create task & propose terms" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Project whiteboard", exact: true })
      .click();
    await expect(
      page.locator(".hierarchy-task").filter({ hasText: "Member export task" }),
    ).toHaveCount(1);
    await expect(
      page.locator(".hierarchy-task").filter({
        hasText: "General assigned task",
      }),
    ).toHaveCount(1);
    if ((page.viewportSize()?.width ?? 1440) < 760) {
      await page.getByLabel(`Open role ${fixture.role}`, { exact: true })
        .click();
    } else {await page.locator(".hierarchy-role").getByRole("button", {
        name: fixture.role,
        exact: true,
      }).click();}
    await page.locator(".roster-member").filter({ hasText: fixture.name })
      .click();
    await member.getByRole("button", { name: "+ Add task", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(member).toBeVisible();
    if (info.project.name === "chromium") {
      await page.screenshot({
        path: info.outputPath("merged-member-tasks.png"),
        fullPage: true,
      });
    }
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
  ).toHaveCount(1);
});
