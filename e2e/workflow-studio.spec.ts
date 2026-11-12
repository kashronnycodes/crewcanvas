import { expect, type Page, test } from "@playwright/test";

async function openRole(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1280) < 760) {
    await page.getByLabel(`Open role ${name}`, { exact: true }).click();
  } else {await page.locator(".hierarchy-role").getByRole("button", {
      name,
      exact: true,
    }).click();}
}
async function createStudio(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "New board project" }).click();
  await page.getByLabel("Project title").fill("Launch campaign");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Studio project")).toHaveValue(/.+/);
  await expect(page.getByText("3 roles · 0 tasks")).toBeVisible();
  for (
    const [role, person, id] of [[
      "Editor",
      "jacob",
      "20000000-0000-4000-8000-000000000002",
    ], [
      "Thumbnail Designer",
      "vincent",
      "20000000-0000-4000-8000-000000000003",
    ]]
  ) {
    await openRole(page, role);
    await page.getByRole("button", { name: "+ Add member", exact: true })
      .click();
    await page.getByLabel("Workspace freelancer").selectOption(id);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("complementary", { name: "Role roster" }).getByText(
        new RegExp(person, "i"),
      ),
    ).toBeVisible();
    await page.getByLabel("Close roster").click();
  }
}
async function addTask(page: Page) {
  await page.locator(".workflow-heading").getByRole("button", {
    name: "+ Add task",
    exact: true,
  }).click();
  await page.getByLabel("Task title").fill("Edit launch video");
  await page.getByLabel("The brief").fill(
    "Edit the launch campaign into one polished short video.",
  );
  await page.getByRole("textbox", { name: /Deliverables/ }).fill(
    "One final MP4 export",
  );
  await page.getByRole("button", { name: "Create task & propose terms" })
    .click();
  await expect(page.getByLabel("Task whiteboard")).toContainText(
    "Edit launch video",
  );
}
test(
  "organizes a project, three roles and two members; tasks and custom roles survive refresh",
  async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await createStudio(page);
    await addTask(page);
    await expect(page.locator(".hierarchy-roles")).toBeVisible();
    await expect(page.locator(".hierarchy-member, .hierarchy-task"))
      .toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("reference-overview.png"),
      fullPage: true,
    });
    await page.getByLabel("Fullscreen canvas", { exact: true }).click();
    await page.getByLabel("Fit to content", { exact: true }).click();
    await page.getByLabel("Shapes", { exact: true }).click();
    await expect(page.getByLabel("Add rectangle", { exact: true }))
      .toBeVisible();
    await page.getByLabel("Shapes", { exact: true }).click();
    await expect(page.getByLabel("Exit fullscreen", { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("reference-overview-fullscreen.png"),
      fullPage: true,
    });
    await page.locator(".hierarchy-role").getByRole("button", {
      name: "Editor",
      exact: true,
    }).click();
    await expect(page.getByRole("complementary", { name: "Role roster" }))
      .toBeVisible();
    await expect(page.getByLabel("Fullscreen canvas", { exact: true }))
      .toBeVisible();
    await page.getByLabel("Close roster").click();
    await page.getByRole("button", { name: "Show task map", exact: true })
      .click();
    await expect(page.locator(".hierarchy-task")).toHaveCount(1);
    await page.getByRole("button", { name: "Show role overview", exact: true })
      .click();
    await page.getByRole("button", { name: "+ Add role", exact: true }).click();
    await page.getByLabel("Role name").fill("Sound designer");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByLabel("Close roster").click();
    await page.reload();
    await expect(page.getByLabel("Studio project")).toContainText(
      "Launch campaign",
    );
    await page.getByLabel("Studio project").selectOption({
      label: "Launch campaign",
    });
    await expect(page.getByText("4 roles · 1 tasks")).toBeVisible();
    await expect(page.getByLabel("Task whiteboard")).toContainText(
      "Edit launch video",
    );
    await page.getByLabel("Fit to content").click();
    await openRole(page, "Editor");
    await expect(page.locator(".roster-grid .roster-add")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("reference-roster.png"),
      fullPage: true,
    });
    await page.locator(".roster-member").filter({ hasText: /jacob/i }).click();
    await expect(page.getByRole("complementary", { name: "Member tasks" }))
      .toContainText("Edit launch video");
    await page.getByRole("button", { name: "Duplicate as draft" }).click();
    await expect(page.getByLabel("Task title")).toHaveValue(
      "Edit launch video (copy)",
    );
    await page.getByRole("button", { name: "Create draft task" }).click();
    await page.getByLabel("Close roster").click();
    await expect(page.getByLabel("Task whiteboard")).toContainText(
      "Edit launch video (copy)",
    );
  },
);

test(
  "task assignment follows the selected role member",
  async ({ page }) => {
    test.setTimeout(60000);
    await createStudio(page);
    await openRole(page, "Editor");
    await page.getByRole("button", { name: "+ Add member", exact: true })
      .click();
    await page.getByLabel("Workspace freelancer").selectOption(
      "20000000-0000-4000-8000-000000000003",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByLabel("Close roster").click();

    await page.locator(".workflow-heading").getByRole("button", {
      name: "+ Add task",
      exact: true,
    }).click();
    await page.getByLabel("Assigned to").selectOption(
      "20000000-0000-4000-8000-000000000003",
    );
    await page.getByLabel("Task title").fill("Vincent's launch task");
    await page.getByLabel("The brief").fill(
      "Create the launch campaign thumbnail and deliver one final export.",
    );
    await page.getByRole("textbox", { name: /Deliverables/ }).fill(
      "Final launch thumbnail",
    );
    await page.getByRole("button", { name: "Create task & propose terms" })
      .click();

    await openRole(page, "Editor");
    await page.locator(".roster-member").filter({ hasText: /Vincent/i })
      .click();
    const memberTasks = page.getByRole("complementary", {
      name: "Member tasks",
    });
    await expect(memberTasks.getByText("Vincent's launch task"))
      .toBeVisible();

    await page.getByRole("button", { name: "Back to role roster" }).click();
    await page.locator(".roster-member").filter({ hasText: /Jacob/i })
      .click();
    await expect(
      page.getByRole("complementary", { name: "Member tasks" })
        .getByText("Vincent's launch task"),
    ).toHaveCount(0);
  },
);

test(
  "reference flow opens a member's delivery and returns through revision and task panels",
  async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.route(
      "https://drive.google.com/**",
      (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<p>Preview fixture</p>",
        }),
    );
    await page.goto("/");
    await expect(page.getByLabel("Studio project")).toBeVisible();
    const fixture = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("crewcanvas.demo.v1")!);
      const task = s.projects.find((p: { title: string }) =>
        p.title === "Event recap"
      );
      const member = s.people.find((p: { id: string }) =>
        p.id === task.workerId
      );
      return {
        role: member.role,
        name: member.name,
        invoices: JSON.stringify(task.invoices),
        revisionCount: task.revisions.length,
      };
    });
    await openRole(page, fixture.role);
    await page.locator(".roster-member").filter({ hasText: fixture.name })
      .click();
    await page.locator(".member-task").getByRole("button", {
      name: "Event recap",
      exact: true,
    }).click();
    const detail = page.getByRole("dialog");
    await expect(detail).toHaveClass(/reference-drawer/);
    await expect(page.getByRole("complementary", { name: "Member tasks" }))
      .toHaveCount(0);
    await expect(detail.locator(".deliverable-preview")).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "Approve Work", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("reference-delivery.png"),
      fullPage: true,
    });
    await detail.getByRole("button", { name: "Request Revision", exact: true })
      .click();
    await expect(
      detail.getByRole("heading", { name: "Request revision", exact: true }),
    ).toBeVisible();
    await detail.getByLabel("Your feedback").fill(
      "Please replace the closing sequence.",
    );
    await detail.getByLabel("Revision arrangement").selectOption("paid");
    await detail.getByLabel("Proposed fee · USD").fill("0.55");
    await page.screenshot({
      path: testInfo.outputPath("reference-revision-form.png"),
      fullPage: true,
    });
    await detail.getByRole("button", {
      name: "Back to delivery & revisions",
      exact: true,
    }).click();
    await expect(detail.locator(".deliverable-preview")).toBeVisible();
    await detail.getByRole("button", { name: "Add revision", exact: true })
      .click();
    await expect(detail.getByLabel("Your feedback")).toHaveValue(
      "Please replace the closing sequence.",
    );
    await detail.getByRole("button", {
      name: "Back to delivery & revisions",
      exact: true,
    }).click();
    await detail.getByRole("button", {
      name: "Back to assigned tasks",
      exact: true,
    }).click();
    await expect(page.getByRole("complementary", { name: "Member tasks" }))
      .toBeVisible();
    const after = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("crewcanvas.demo.v1")!);
      const task = s.projects.find((p: { title: string }) =>
        p.title === "Event recap"
      );
      return {
        invoices: JSON.stringify(task.invoices),
        revisionCount: task.revisions.length,
      };
    });
    expect(after).toEqual({
      invoices: fixture.invoices,
      revisionCount: fixture.revisionCount,
    });
  },
);

test(
  "saved whiteboard edits, shortcuts, shapes, drawing, links and dark inputs work",
  async ({ page }, testInfo) => {
    await createStudio(page);
    await addTask(page);
    await page.getByLabel("Switch to dark mode").click();
    await page.getByLabel("Add sticky note", { exact: true }).click();
    const inspector = page.getByRole("complementary", {
      name: "Whiteboard object inspector",
    });
    await inspector.getByRole("textbox", { name: "Content", exact: true }).fill(
      "Keep the opening simple.",
    );
    await inspector.getByRole("textbox", { name: "Content", exact: true })
      .press("Control+a");
    await inspector.getByRole("textbox", { name: "Content", exact: true })
      .press("Control+d");
    await expect(inspector).toBeVisible();
    const colors = await inspector.getByRole("textbox", {
      name: "Content",
      exact: true,
    }).evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      color: getComputedStyle(el).color,
    }));
    expect(colors.background).toBe("rgb(42, 46, 47)");
    expect(colors.color).toBe("rgb(242, 242, 235)");
    await inspector.getByRole("button", { name: "Save object", exact: true })
      .click();
    await page.getByLabel("Close object inspector").click();
    const board = page.getByLabel("Project collaboration whiteboard", {
      exact: true,
    });
    await board.focus();
    await board.press("Control+d");
    await expect(
      page.locator(".board-object-text").filter({
        hasText: "Keep the opening simple.",
      }),
    ).toHaveCount(2);
    const savedNoteCount = () =>
      page.evaluate(() =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("crewcanvas.board.")
        ).flatMap((key) =>
          JSON.parse(localStorage.getItem(key) ?? "[]")
        ).filter((row: { deleted: boolean; data: { text: string } }) =>
          !row.deleted && row.data.text === "Keep the opening simple."
        ).length
      );
    await expect.poll(savedNoteCount).toBe(2);
    await page.getByLabel("Close object inspector").click();
    await board.focus();
    await board.press("Control+a");
    await page.getByRole("button", { name: "Group", exact: true }).click();
    await expect.poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("crewcanvas.board.")
        ).flatMap((k) =>
          JSON.parse(localStorage.getItem(k)!).filter((
            r: { data: { groupId?: string } },
          ) => r.data.groupId)
        ).length
      )
    ).toBe(2);
    await page.getByRole("button", { name: "Align left", exact: true }).click();
    await page.getByRole("button", { name: "Lock", exact: true }).click();
    await expect.poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("crewcanvas.board.")
        ).flatMap((k) =>
          JSON.parse(localStorage.getItem(k)!).filter((
            r: { data: { locked?: boolean } },
          ) => r.data.locked)
        ).length
      )
    ).toBe(2);
    await page.getByRole("button", { name: "Unlock", exact: true }).click();
    await page.getByRole("button", { name: "Ungroup", exact: true }).click();
    await page.getByLabel("Shapes", { exact: true }).click();
    await page.getByLabel("Add rectangle", { exact: true }).click();
    await inspector.getByRole("button", { name: "Save object", exact: true })
      .click();
    await page.getByLabel("Close object inspector").click();
    await page.getByLabel("Shapes", { exact: true }).click();
    await page.getByLabel("Files and links", { exact: true }).click();
    await page.getByLabel("Add link", { exact: true }).click();
    await inspector.getByLabel("HTTPS reference").fill(
      "https://example.com/reference",
    );
    await inspector.getByRole("button", { name: "Save object", exact: true })
      .click();
    await page.getByLabel("Close object inspector").click();
    await page.getByLabel("Files and links", { exact: true }).click();
    await page.getByLabel("Draw", { exact: true }).click();
    await page.locator(".drawing-layer").scrollIntoViewIfNeeded();
    const segment = await page.evaluate(() => {
      const drawing = document.querySelector(".drawing-layer");
      for (let y = 110; y < innerHeight - 30; y += 15) {
        for (let x = 20; x < innerWidth - 120; x += 15) {
          if (
            [0, 20, 40, 60, 80].every((offset) =>
              drawing?.contains(document.elementFromPoint(x + offset, y))
            )
          ) {
            return { x, y };
          }
        }
      }
      throw new Error("No unobstructed visible drawing surface");
    });
    await page.mouse.move(segment.x, segment.y);
    await page.mouse.down();
    await page.mouse.move(
      segment.x + 80,
      segment.y,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(page.locator(".board-stroke")).toHaveCount(1);
    await page.getByLabel("Select", { exact: true }).click();
    await expect.poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("crewcanvas.board-draft.")
        ).flatMap((key) =>
          JSON.parse(localStorage.getItem(key) ?? "[]")
        ).length
      )
    ).toBe(0);
    await page.screenshot({
      path: testInfo.outputPath("studio-dark.png"),
      fullPage: true,
    });
    await page.reload();
    await page.getByLabel("Studio project").selectOption({
      label: "Launch campaign",
    });
    const storedKinds = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("crewcanvas.board."))
        .flatMap((k) =>
          JSON.parse(localStorage.getItem(k)!).filter((
            r: { deleted: boolean },
          ) => !r.deleted).map((r: { data: { kind: string } }) => r.data.kind)
        )
    );
    expect(storedKinds.filter((k) => k === "stroke")).toHaveLength(1);
    await page.getByLabel("Fit to content").click();
    await expect(
      page.locator(".board-object-text").filter({
        hasText: "Keep the opening simple.",
      }),
    ).toHaveCount(2);
    await expect(page.locator(".board-stroke")).toHaveCount(1);
    await page.getByRole("button", { name: "Reset layout", exact: true })
      .click();
    await page.getByLabel("Switch to light mode").click();
    await page.screenshot({
      path: testInfo.outputPath("studio-light.png"),
      fullPage: true,
    });
    await page.getByLabel("Files and links", { exact: true }).click();
    await page.locator(".board-toolbar input[type=file]").setInputFiles({
      name: "reference.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic task attachment"),
    });
    await expect(page.locator(".board-file")).toHaveCount(1);
    await board.focus();
    await board.press("Control+z");
    await expect(page.locator(".board-file")).toHaveCount(0);
    await board.press("Control+Shift+z");
    await expect(page.locator(".board-file")).toHaveCount(1);
  },
);

test(
  "previews deliveries, records multiple revisions and negotiates a client fee without changing payments",
  async ({ page }, testInfo) => {
    await page.route(
      "https://drive.google.com/**",
      (route) =>
        route.fulfill({
          contentType: "text/html",
          body: "<p>Synthetic provider preview for UI testing</p>",
        }),
    );
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Projects", exact: true }))
      .toBeVisible();
    const financialBefore = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("crewcanvas.demo.v1")!).projects.map((
        p: { id: string; invoices: unknown },
      ) => ({ id: p.id, invoices: p.invoices }))
    );
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("button", { name: "Event recap", exact: true })
      .click();
    await page.getByRole("tab", { name: "Deliverables" }).click();
    await expect(page.getByRole("link", { name: "Open original", exact: true }))
      .toBeVisible();
    await page.getByRole("button", { name: "Add to whiteboard", exact: true })
      .click();
    await expect(page.getByRole("button", { name: "Added to task whiteboard" }))
      .toBeVisible();
    await page.getByRole("tab", { name: "Revisions" }).click();
    await page.getByRole("button", { name: "Add revision", exact: true })
      .click();
    await page.getByLabel("Your feedback").fill(
      "Please create a second opening sequence.",
    );
    await page.getByLabel("Revision arrangement").selectOption("paid");
    await page.getByLabel("Proposed fee · USD").fill("15.00");
    await page.getByRole("button", { name: "Review manually" }).click();
    await page.getByRole("button", { name: "Send revision request" }).click();
    await expect(page.locator(".proposal-price")).toContainText("$15.00");
    await page.getByRole("button", { name: "Add revision", exact: true })
      .click();
    await page.getByLabel("Your feedback").fill(
      "Please shorten the closing title.",
    );
    await page.getByLabel("Revision arrangement").selectOption("included");
    await page.getByRole("button", { name: "Review manually" }).click();
    await page.getByRole("button", { name: "Send revision request" }).click();
    await expect(page.locator(".revision-record")).toHaveCount(2);
    await page.getByLabel("Demo viewing role").selectOption({
      label: "Jeshua · Worker",
    });
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("button", { name: "Event recap", exact: true })
      .click();
    await page.getByRole("tab", { name: "Revisions" }).click();
    await page.getByRole("button", { name: "Counteroffer", exact: true })
      .click();
    await page.getByLabel("Counteroffer · USD").fill("20.00");
    await page.getByRole("button", { name: "Send counteroffer", exact: true })
      .click();
    await page.getByLabel("Demo viewing role").selectOption({
      label: "Myron · Employer",
    });
    await page.getByRole("button", { name: "Revisions", exact: true }).click();
    await page.locator(".revision-queue article").filter({
      has: page.getByRole("heading", { name: "Event recap", exact: true }),
    }).getByRole("button", { name: "Open revisions" }).click();
    await page.getByRole("button", {
      name: "Approve revision fee",
      exact: true,
    }).click();
    await expect(
      page.getByText("Fee approval does not mark payment as paid.", {
        exact: false,
      }),
    ).toHaveCount(0);
    await page.getByLabel("Close worker details").click();
    await page.getByLabel("Switch to dark mode").click();
    await page.locator(".revision-queue article").filter({
      has: page.getByRole("heading", { name: "Event recap", exact: true }),
    }).getByRole("button", { name: "Open revisions" }).click();
    await page.screenshot({
      path: testInfo.outputPath("revision-dark.png"),
      fullPage: true,
    });
    const financialAfter = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("crewcanvas.demo.v1")!).projects.map((
        p: { id: string; invoices: unknown },
      ) => ({ id: p.id, invoices: p.invoices }))
    );
    expect(financialAfter).toEqual(financialBefore);
    await page.reload();
    await page.getByRole("button", { name: "Revisions", exact: true }).click();
    await page.locator(".revision-queue article").filter({
      has: page.getByRole("heading", { name: "Event recap", exact: true }),
    }).getByRole("button", { name: "Open revisions" }).click();
    await expect(page.locator(".revision-record")).toHaveCount(2);
    await expect(page.locator(".proposal-price").filter({ hasText: "$20.00" }))
      .toBeVisible();
  },
);
