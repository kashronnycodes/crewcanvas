import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";

const avaId = "20000000-0000-4000-8000-000000000002";

async function openProjects(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Projects", exact: true }).click();
}

async function createProject(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill(name);
  await page.getByLabel("Assigned to").selectOption(avaId);
  await page.getByLabel("The brief").fill(
    `Create the first version of ${name} and deliver a final export.`,
  );
  await page.getByRole("textbox", { name: /Deliverables/ }).fill(
    `Final export for ${name}`,
  );
  await page.getByRole("button", { name: "Propose agreement" }).click();
}

test("assignment is visible only to the assigned freelancer and updated terms preserve history", async ({ page }) => {
  const projectName = "E2E updated agreement";
  await page.goto("/");
  await createProject(page, projectName);

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Vincent · Worker",
  });
  await openProjects(page);
  await expect(
    page.getByRole("button", { name: projectName, exact: true }),
  ).toHaveCount(0);

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jacob · Worker",
  });
  await openProjects(page);
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await page.getByRole("button", { name: "Accept agreement" }).click();
  await expect(page.getByText("Mutually accepted")).toBeVisible();

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Myron · Employer",
  });
  await openProjects(page);
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await page.getByRole("button", { name: "Propose changes" }).click();
  await page.getByLabel("The brief").fill(
    "Updated scope: produce two export sizes for the campaign.",
  );
  await page.getByRole("textbox", { name: /Deliverables/ }).fill(
    "Landscape export\nSquare export",
  );
  await page.getByRole("button", { name: "Propose agreement" }).click();

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jacob · Worker",
  });
  await openProjects(page);
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await page.getByRole("button", { name: "Accept agreement" }).click();
  await expect(page.getByRole("tabpanel").getByText(
    "Updated scope: produce two export sizes for the campaign.",
  ).first()).toBeVisible();
  await page.getByText(/Agreement history · 2 versions/).click();
  await expect(page.locator(".agreement-history").getByText(
    `Create the first version of ${projectName} and deliver a final export.`,
  )).toBeVisible();
  await expect(page.locator(".agreement-history").getByText(
    "VERSION 2 · CURRENT ACCEPTED TERMS",
  )).toBeVisible();
});

test("freelancer can decline a proposed agreement", async ({ page }) => {
  const projectName = "E2E declined agreement";
  await page.goto("/");
  await createProject(page, projectName);
  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jacob · Worker",
  });
  await openProjects(page);
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await page.getByRole("button", { name: "Decline", exact: true }).click();
  await page.getByText(/Agreement history · 1 version/).click();
  await expect(page.locator(".agreement-history").getByText(
    "VERSION 1 · DECLINED",
  )).toBeVisible();
  await expect(page.getByText("Awaiting agreement", { exact: true }))
    .toBeVisible();
});

test("employer requests a revision and freelancer responds; request persists after reload", async ({ page }) => {
  await page.goto("/");
  await openProjects(page);
  await page.getByRole("button", { name: "Event recap", exact: true }).click();
  await page.getByRole("tab", { name: "Deliverables" }).click();
  await page.getByRole("button", { name: "Request Revision" }).click();

  const feedback = "Please adjust the opening title card.";
  await page.getByLabel("Your feedback").fill(feedback);
  await page.getByRole("button", { name: "Review manually" }).click();
  await page.getByRole("button", { name: "Send revision request" }).click();
  await expect(page.getByText(feedback)).toBeVisible();
  await expect(page.getByText("awaiting response", { exact: true })).toBeVisible();

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jeshua · Worker",
  });
  await openProjects(page);
  await page.getByRole("button", { name: "Event recap", exact: true }).click();
  await page.getByRole("tab", { name: "Revisions" }).click();
  await page.getByRole("button", { name: "Accept as included" }).click();
  await expect(page.getByText("included", { exact: true })).toBeVisible();
  await expect(page.getByText("1 round used", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jeshua · Worker",
  });
  await openProjects(page);
  await page.getByRole("button", { name: "Event recap", exact: true }).click();
  await page.getByRole("tab", { name: "Revisions" }).click();
  await expect(page.getByText(feedback)).toBeVisible();
  await expect(page.getByText("included", { exact: true })).toBeVisible();
});

test("uploads a project file and submits its stored version as delivery", async ({ page }) => {
  const projectName = "E2E uploaded delivery";
  const fileName = "e2e-delivery.txt";
  await page.goto("/");
  await createProject(page, projectName);

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jacob · Worker",
  });
  await openProjects(page);
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await page.getByRole("button", { name: "Accept agreement" }).click();
  await page.getByRole("tab", { name: "Deliverables" }).click();

  await page.locator(".file-picker input[type=file]").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("First E2E delivery version."),
  });
  await expect(page.getByRole("button", { name: `${fileName} · v1` }))
    .toBeVisible();
  await page.getByLabel("Project file").selectOption({ label: `${fileName} · v1` });
  await page.getByLabel("Version label").fill("v1 · uploaded final");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("button", { name: /Open submitted file · v1/ }))
    .toBeVisible();

  await page.reload();
  await openProjects(page);
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await page.getByRole("tab", { name: "Deliverables" }).click();
  await expect(page.getByText("v1 · uploaded final")).toBeVisible();
  await expect(page.getByRole("button", { name: /Open submitted file · v1/ }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: `${fileName} · v1` }))
    .toBeVisible();
});

test("replaced workspace files retain version history after refresh", async ({ page }) => {
  const fileName = "e2e-version.txt";
  await page.goto("/");
  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jacob · Worker",
  });
  await openProjects(page);
  await page.getByRole("button", { name: "Recruitment cut", exact: true })
    .click();
  await page.getByRole("tab", { name: "Deliverables" }).click();
  await page.locator(".file-picker input[type=file]").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("First version."),
  });
  await expect(page.getByRole("button", { name: `${fileName} · v1` }))
    .toBeVisible();

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Myron · Employer",
  });
  await page.getByRole("button", { name: "Work map", exact: true }).click();
  await page.getByRole("button", { name: "Details & tools", exact: true }).click();
  await page.getByRole("button", { name: "Fit to screen" }).click();
  const fileCard = page.locator(".react-flow__node-work").filter({
    hasText: fileName,
  });
  await fileCard.getByRole("button", { name: fileName, exact: true })
    .dispatchEvent("click");
  const inspector = page.getByLabel("Canvas object inspector");
  await inspector.getByRole("button", {
    name: "Replace with new version",
  }).click();
  await inspector.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("Second version."),
  });
  await expect(fileCard).toContainText("Stored · v2");
  await fileCard.getByRole("button", { name: fileName, exact: true })
    .dispatchEvent("click");
  await inspector.getByText("Version history").click();
  await expect(inspector.getByRole("button", { name: `v1 · ${fileName}` }))
    .toBeVisible();
  await expect(inspector.getByRole("button", { name: `v2 · ${fileName}` }))
    .toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Work map", exact: true }).click();
  await page.getByRole("button", { name: "Details & tools", exact: true }).click();
  await page.getByRole("button", { name: "Fit to screen" }).click();
  await page.locator(".react-flow__node-work").filter({ hasText: fileName })
    .getByRole("button", { name: fileName, exact: true })
    .dispatchEvent("click");
  const restoredInspector = page.getByLabel("Canvas object inspector");
  await restoredInspector.getByText("Version history").click();
  await expect(
    restoredInspector.getByRole("button", { name: `v1 · ${fileName}` }),
  ).toBeVisible();
  await expect(
    restoredInspector.getByRole("button", { name: `v2 · ${fileName}` }),
  ).toBeVisible();
});

test("rejects unsupported and empty project files", async ({ page }) => {
  await page.goto("/");
  await openProjects(page);
  await page.getByRole("button", { name: "Recruitment cut", exact: true })
    .click();
  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jacob · Worker",
  });
  await openProjects(page);
  await page.getByRole("button", { name: "Recruitment cut", exact: true })
    .click();
  await page.getByRole("tab", { name: "Deliverables" }).click();

  const upload = page.locator(".file-picker input[type=file]");
  await upload.setInputFiles({
    name: "unsupported.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not allowed"),
  });
  await expect(page.getByRole("alert")).toContainText("Unsupported file");

  await upload.setInputFiles({
    name: "empty.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(0),
  });
  await expect(page.getByRole("alert")).toContainText("non-empty file");
});

test("freelancer proposes extra work and employer accepts it", async ({ page }) => {
  await page.goto("/");
  await openProjects(page);
  await page.getByRole("button", { name: "Event recap", exact: true }).click();
  await page.getByRole("tab", { name: "Deliverables" }).click();
  await page.getByRole("button", { name: "Request Revision" }).click();
  await page.getByLabel("Your feedback").fill(
    "Please add an alternate ending to the event recap.",
  );
  await page.getByRole("button", { name: "Review manually" }).click();
  await page.getByRole("button", { name: "Send revision request" }).click();

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Jeshua · Worker",
  });
  await openProjects(page);
  await page.getByRole("button", { name: "Event recap", exact: true }).click();
  await page.getByRole("tab", { name: "Revisions" }).click();
  await page.getByRole("button", { name: /Propose revision fee/ }).click();
  await page.getByLabel("Additional price · USD").fill("25.00");
  await page.getByRole("button", { name: "Send proposal" }).click();
  await expect(page.getByText("+ $25.00")).toBeVisible();
  await expect(page.getByText("pending", { exact: true })).toBeVisible();

  await page.getByLabel("Demo viewing role").selectOption({
    label: "Myron · Employer",
  });
  await openProjects(page);
  await page.getByRole("button", { name: "Event recap", exact: true }).click();
  await page.getByRole("tab", { name: "Revisions" }).click();
  await page.getByRole("button", { name: "Approve revision fee" }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Revisions" }).getByText(
      "accepted",
      { exact: true },
    ),
  ).toBeVisible();
});

test("project whiteboard note edits persist after refresh", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Project whiteboard" }).click();
  await expect(page.getByLabel("Project collaboration whiteboard"))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Add sticky note" }))
    .toBeEnabled();

  await page.getByRole("button", { name: "Add sticky note" }).click();
  const inspector = page.getByLabel("Whiteboard object inspector");
  await expect(inspector).toBeVisible();
  const content = inspector.getByLabel("Content");
  await content.fill("E2E whiteboard note survives refresh");
  await inspector.getByRole("button", { name: "Save object" }).click();
  await expect(page.getByText("Saved in this browser")).toBeVisible();
  await expect(page.locator(".board-object-text")).toContainText(
    "E2E whiteboard note survives refresh",
  );

  await page.reload();
  await page.getByRole("button", { name: "Project whiteboard" }).click();
  await expect(page.locator(".board-object-text")).toContainText(
    "E2E whiteboard note survives refresh",
  );
});

test("workspace canvas group movement persists after refresh", async ({ page }) => {
  test.skip(
    test.info().project.name.startsWith("Mobile"),
    "The workspace canvas is replaced by the project list on mobile.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Work map", exact: true }).click();
  await page.getByRole("button", { name: "Details & tools", exact: true }).click();

  const group = page.locator(".react-flow__node-group").filter({
    hasText: "Hackathon Game Winners",
  });
  await expect(group).toBeVisible();
  const before = await page.evaluate(() => {
    const snapshot = JSON.parse(
      localStorage.getItem("crewcanvas.demo.v1") ?? "{}",
    );
    return snapshot.layout.groups.find(
      (item: { name: string }) => item.name === "Hackathon Game Winners",
    );
  });
  const bounds = await group.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2 + 90,
    bounds!.y + bounds!.height / 2 + 60,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect.poll(async () =>
    page.evaluate(() => {
      const snapshot = JSON.parse(
        localStorage.getItem("crewcanvas.demo.v1") ?? "{}",
      );
      return snapshot.layout.groups.find(
        (item: { name: string }) => item.name === "Hackathon Game Winners",
      );
    })
  ).not.toEqual(before);
  const after = await page.evaluate(() => {
    const snapshot = JSON.parse(
      localStorage.getItem("crewcanvas.demo.v1") ?? "{}",
    );
    return snapshot.layout.groups.find(
      (item: { name: string }) => item.name === "Hackathon Game Winners",
    );
  });

  await page.reload();
  const restored = await page.evaluate(() => {
    const snapshot = JSON.parse(
      localStorage.getItem("crewcanvas.demo.v1") ?? "{}",
    );
    return snapshot.layout.groups.find(
      (item: { name: string }) => item.name === "Hackathon Game Winners",
    );
  });
  expect(restored).toEqual(after);
});

test("workspace canvas pan mode moves the viewport and select mode can be restored", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.startsWith("Mobile");
  await page.goto("/");
  await page.getByRole("button", { name: "Work map", exact: true }).click();
  await page.getByRole("button", { name: "Details & tools", exact: true })
    .click();

  const panTool = page.getByLabel("Pan tool", { exact: true });
  const selectTool = page.getByLabel("Select tool", { exact: true });
  const viewport = page.locator(".react-flow__viewport");
  await expect(page.locator(".react-flow__node").first()).toBeVisible();
  await page.getByLabel("Fit to screen").click();
  await panTool.click();
  await expect(panTool).toHaveClass(/active/);
  await expect(selectTool).not.toHaveClass(/active/);

  const transformBefore = await viewport.getAttribute("style");
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("crewcanvas.demo.v1") ?? "{}").layout
      .viewport
  );
  const start = await page.locator(".react-flow__pane").evaluate((pane) => {
    const rect = pane.getBoundingClientRect();
    for (let y = rect.top + 20; y < rect.bottom - 20; y += 20) {
      for (let x = rect.left + 20; x < rect.right - 20; x += 20) {
        const target = document.elementFromPoint(x, y);
        if (
          target && pane.contains(target) &&
          !target.closest(
            ".react-flow__node, .canvas-tools, .zoom-tools, .map-display-toggle",
          )
        ) return { x, y };
      }
    }
    throw new Error("No unobstructed workspace canvas point is visible.");
  });
  const end = { x: start.x + 100, y: start.y + 60 };
  if (mobile) {
    await page.evaluate(({ start, end }) => {
      const pane = document.querySelector(".react-flow__pane");
      if (!pane) throw new Error("The workspace canvas pane is unavailable.");
      const makeTouch = (x: number, y: number) =>
        ({
          identifier: 1,
          target: pane,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
        });
      const dispatch = (
        type: string,
        touch: ReturnType<typeof makeTouch>,
        active: ReturnType<typeof makeTouch>[],
      ) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, {
          touches: { value: active },
          targetTouches: { value: active },
          changedTouches: { value: [touch] },
        });
        pane.dispatchEvent(event);
      };
      const first = makeTouch(start.x, start.y);
      dispatch("touchstart", first, [first]);
      let last = first;
      for (let step = 1; step <= 8; step++) {
        last = makeTouch(
          start.x + (end.x - start.x) * step / 8,
          start.y + (end.y - start.y) * step / 8,
        );
        dispatch("touchmove", last, [last]);
      }
      dispatch("touchend", last, []);
    }, { start, end });
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  }

  await expect.poll(() => viewport.getAttribute("style"))
    .not.toBe(transformBefore);
  await expect.poll(() =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("crewcanvas.demo.v1") ?? "{}").layout
        .viewport
    )
  ).not.toEqual(before);

  await selectTool.click();
  await expect(selectTool).toHaveClass(/active/);
  await expect(panTool).not.toHaveClass(/active/);
});

test("collapsed workspace canvas groups persist after refresh", async ({ page }) => {
  test.skip(
    test.info().project.name.startsWith("Mobile"),
    "Canvas group controls are desktop-only; mobile gets a separate responsive check.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Work map", exact: true }).click();
  await page.getByRole("button", { name: "Details & tools", exact: true }).click();
  const collapseButton = page.getByRole("button", { name: /^Collapse / }).first();
  const expandedName = await collapseButton.getAttribute("aria-label");
  expect(expandedName).toBeTruthy();
  const collapsedName = expandedName!.replace("Collapse ", "Expand ");
  await collapseButton.click();
  await expect(page.getByRole("button", { name: collapsedName })).toBeVisible();
  await expect.poll(() =>
    page.evaluate((buttonName) => {
      const saved = JSON.parse(
        localStorage.getItem("crewcanvas.demo.v1") ?? "{}",
      );
      const groupName = buttonName.replace("Expand ", "");
      return saved.layout?.groups?.find((group: { name: string }) =>
        group.name === groupName
      )?.collapsed;
    }, collapsedName)
  ).toBe(true);
  await expect(page.getByText("All changes saved")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Work map", exact: true }).click();
  await page.getByRole("button", { name: "Details & tools", exact: true }).click();
  await expect(page.getByRole("button", { name: collapsedName })).toBeVisible();
});

test("mobile viewport keeps project navigation usable without horizontal page overflow", async ({ page }, testInfo) => {
  test.skip(
    !testInfo.project.name.startsWith("Mobile"),
    "Responsive layout check runs in the configured mobile projects.",
  );
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Projects", exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", {
    name: "Good work starts with your people.",
  })).toBeVisible();
  await expect.poll(() =>
    page.evaluate(() =>
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth
    )
  ).toBe(true);
});
