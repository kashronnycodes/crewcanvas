import { test, expect } from "./backend-fixture";
import type { Page } from "@playwright/test";
import { newBoardData } from "../shared/board";

test.use({ viewport: { width: 1440, height: 1080 } });
async function openBoard(page: Page, view: "Project Studio" | "Project Whiteboard") {
  await page.goto("/");
  await expect(page.getByLabel("Add sticky note", { exact: true })).toBeEnabled();
  await page.getByRole("button", { name: view, exact: true }).click();
  const scope = page.locator(view==="Project Studio"?".workflow-studio":".project-board-shell");
  await expect(scope.getByLabel("Add sticky note", { exact: true })).toBeEnabled();
  return scope.locator(".focus-canvas");
}
async function fullscreenGeometry(page: Page) {
  return page.locator(".focus-canvas.is-fullscreen").evaluate(wrapper => {
    const rect = (element: Element) => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom, right: b.right }; };
    const board = wrapper.querySelector(".project-board")!;
    return { viewport: { width: innerWidth, height: innerHeight }, native: document.fullscreenElement === wrapper,
      wrapper: rect(wrapper), board: rect(board), header: rect(board.querySelector(".board-context")!),
      canvas: rect(board.querySelector(":scope > .react-flow")!), controls: rect(board.querySelector(".board-bottom")!),
      toolbar: rect(board.querySelector(".board-toolbar")!), exit: rect(wrapper.querySelector(".focus-toggle")!) };
  });
}
async function fillsFullscreen(page: Page) {
  await expect.poll(async () => {
    const m = await fullscreenGeometry(page);
    return Math.max(Math.abs(m.wrapper.height - m.viewport.height), Math.abs(m.board.bottom - m.wrapper.bottom), Math.abs(m.canvas.bottom - m.board.bottom));
  }).toBeLessThanOrEqual(2);
  const m = await fullscreenGeometry(page);
  expect(m.canvas.y).toBeGreaterThanOrEqual(m.header.bottom);
  expect(m.canvas.y - m.header.bottom).toBeLessThanOrEqual(12);
  expect(m.canvas.height).toBeGreaterThan(m.viewport.height - m.header.height - 30);
  expect(m.board.bottom - m.controls.bottom).toBeLessThanOrEqual(16);
  expect(m.toolbar.y).toBeGreaterThanOrEqual(0);
  expect(m.toolbar.bottom).toBeLessThanOrEqual(m.viewport.height);
  expect(m.exit.right).toBeLessThanOrEqual(m.viewport.width);
  await expect(page.getByRole("button", { name: "Exit fullscreen", exact: true })).toBeVisible();
}
async function viewportState(page: Page) {
  return page.locator(".focus-canvas.is-fullscreen .react-flow__viewport, .focus-canvas:not(.is-fullscreen) .react-flow__viewport").last().evaluate(element => {
    const m = new DOMMatrixReadOnly((element as HTMLElement).style.transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
}

for (const view of ["Project Studio", "Project Whiteboard"] as const) {
  test(`${view}: actual canvas fills fullscreen and restores after button, Escape and resize`, async ({ page, backend }) => {
    const wrapper = await openBoard(page, view);
    const normal = (await wrapper.locator(".project-board").boundingBox())!;
    const before = await viewportState(page);
    await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
    await fillsFullscreen(page);
    expect(await viewportState(page)).toEqual(before);
    await page.setViewportSize({ width: 1190, height: 860 });
    await fillsFullscreen(page);
    expect(await viewportState(page)).toEqual(before);
    await page.getByLabel("Exit fullscreen", { exact: true }).click();
    await expect(wrapper).not.toHaveClass(/is-fullscreen/);
    expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1080 });
    await expect.poll(async () => (await wrapper.locator(".project-board").boundingBox())!.height).toBeCloseTo(normal.height, 0);
    await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
    await fillsFullscreen(page);
    await page.keyboard.press("Escape");
    await expect(wrapper).not.toHaveClass(/is-fullscreen/);
    expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    for (let repeat = 0; repeat < 2; repeat++) {
      await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
      await fillsFullscreen(page);
      await page.getByLabel("Exit fullscreen", { exact: true }).click();
      await expect(wrapper).not.toHaveClass(/is-fullscreen/);
    }
  });
}

test("fixed-position fallback fills the viewport when native fullscreen is unavailable", async ({ page, backend }) => {
  await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error("Native fullscreen is unavailable")); });
  const wrapper = await openBoard(page, "Project Whiteboard");
  await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
  await fillsFullscreen(page);
  expect((await fullscreenGeometry(page)).native).toBe(false);
  await page.setViewportSize({ width: 1100, height: 720 });
  await fillsFullscreen(page);
  await page.keyboard.press("Escape");
  await expect(wrapper).not.toHaveClass(/is-fullscreen/);
});

test("fullscreen preserves viewport, tool and proportions; pan, drag and drawing use resized coordinates", async ({ page, backend }) => {
  const noteId = crypto.randomUUID();
  backend.boards.push({ id: noteId, project_id: backend.snapshot.projects[0].id, author_id: backend.snapshot.actorId, updated_by: backend.snapshot.actorId, version: 1, deleted: false, updated_at: new Date().toISOString(), data: { ...newBoardData("note", 450, 360), text: "Resize coordinate check" } });
  const wrapper = await openBoard(page, "Project Whiteboard");
  await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
  await fillsFullscreen(page);
  const canvas = wrapper.locator(".project-board > .react-flow");
  let rect = (await canvas.boundingBox())!;
  const beforePan = await viewportState(page);
  await page.mouse.move(rect.x + rect.width - 130, rect.y + rect.height - 160);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 220, rect.y + rect.height - 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => viewportState(page)).not.toEqual(beforePan);
  await wrapper.getByLabel("Zoom in", { exact: true }).click();
  await expect.poll(async () => (await viewportState(page)).zoom).toBeGreaterThan(beforePan.zoom);
  await wrapper.getByLabel("Select", { exact: true }).click();
  const preserved = await viewportState(page);
  const note = wrapper.locator(`.react-flow__node[data-id="${noteId}"]`);
  const proportions = (await note.boundingBox())!;
  await wrapper.getByLabel("Exit fullscreen", { exact: true }).click();
  await expect(wrapper).not.toHaveClass(/is-fullscreen/);
  await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
  await page.setViewportSize({ width: 1240, height: 900 });
  await fillsFullscreen(page);
  expect(await viewportState(page)).toEqual(preserved);
  await expect(wrapper.getByLabel("Select", { exact: true })).toHaveAttribute("aria-pressed", "true");
  const resized = (await note.boundingBox())!;
  expect(resized.width).toBeCloseTo(proportions.width, 1);
  expect(resized.height).toBeCloseTo(proportions.height, 1);
  await note.click();
  await expect(note).toHaveClass(/selected/);
  await page.mouse.move(resized.x + resized.width / 2, resized.y + resized.height / 2);
  await page.mouse.down();
  // Cross the normal drag threshold before measuring screen-to-world deltas.
  await page.mouse.move(resized.x + resized.width / 2 + 10, resized.y + resized.height / 2, { steps: 1 });
  await expect(note).toHaveClass(/dragging/);
  const dragStart = await note.evaluate(element => {
    const m = new DOMMatrixReadOnly((element as HTMLElement).style.transform);
    return { x: m.e, y: m.f };
  });
  await page.mouse.move(resized.x + resized.width / 2 + 52, resized.y + resized.height / 2 + 28, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => backend.boards.find(row => row.id === noteId)!.data.x).toBeCloseTo(dragStart.x + 42 / preserved.zoom, 0);
  expect(backend.boards.find(row => row.id === noteId)!.data.y).toBeCloseTo(dragStart.y + 28 / preserved.zoom, 0);

  await wrapper.getByLabel("Draw", { exact: true }).click();
  rect = (await canvas.boundingBox())!;
  const drawingViewport = await viewportState(page);
  const start = { x: rect.x + rect.width * .7, y: rect.y + rect.height - 170 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 50, start.y - 35, { steps: 10 }); await page.mouse.up();
  await expect.poll(() => backend.boards.filter(row => row.data.kind === "stroke").length).toBe(1);
  const drawing = backend.boards.find(row => row.data.kind === "stroke")!.data;
  expect(drawing.x + drawing.points[0][0]).toBeCloseTo((start.x - rect.x - drawingViewport.x) / drawingViewport.zoom, 0);
  expect(drawing.y + drawing.points[0][1]).toBeCloseTo((start.y - rect.y - drawingViewport.y) / drawingViewport.zoom, 0);
  await page.keyboard.press("Escape");
  await expect(wrapper).not.toHaveClass(/is-fullscreen/);
  await expect(wrapper.getByLabel("Draw", { exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("unsaved object draft and selection survive fullscreen, Escape and resize", async ({ page, backend }) => {
  const noteId = crypto.randomUUID();
  backend.boards.push({ id: noteId, project_id: backend.snapshot.projects[0].id, author_id: backend.snapshot.actorId, updated_by: backend.snapshot.actorId, version: 1, deleted: false, updated_at: new Date().toISOString(), data: { ...newBoardData("note", 450, 360), text: "Original saved note" } });
  const wrapper = await openBoard(page, "Project Whiteboard");
  await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
  await fillsFullscreen(page);
  await wrapper.getByLabel("Select", { exact: true }).click();
  const note = wrapper.locator(`.react-flow__node[data-id="${noteId}"]`);
  await note.dblclick();
  const content = wrapper.getByRole("textbox", { name: "Content", exact: true });
  await content.fill("Unsaved fullscreen draft");
  await page.setViewportSize({ width: 1190, height: 860 });
  await fillsFullscreen(page);
  await page.keyboard.press("Escape");
  await expect(wrapper).not.toHaveClass(/is-fullscreen/);
  await expect(content).toHaveValue("Unsaved fullscreen draft");
  await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
  await fillsFullscreen(page);
  await wrapper.getByLabel("Exit fullscreen", { exact: true }).click();
  await expect(content).toHaveValue("Unsaved fullscreen draft");
  // The normal smaller viewport may virtualize the selected card offscreen.
  await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
  await fillsFullscreen(page);
  await expect(note).toHaveClass(/selected/);
  await wrapper.getByLabel("Exit fullscreen", { exact: true }).click();
  expect(backend.boards.find(row => row.id === noteId)!.data.text).toBe("Original saved note");
  expect(backend.boards.find(row => row.id === noteId)!.version).toBe(1);
});

test("card navigation remains accurate in Pan after fullscreen resize", async ({ page, backend }) => {
  const wrapper = await openBoard(page, "Project Studio");
  await wrapper.getByLabel("Fullscreen canvas", { exact: true }).click();
  await page.setViewportSize({ width: 1220, height: 900 });
  await fillsFullscreen(page);
  await wrapper.locator(".hierarchy-role").getByRole("button", { name: "Designer", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Role roster" })).toBeVisible();
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});
