import { expect, type Page } from "@playwright/test";
export async function closePanels(page: Page) {
  for (let i = 0; i < 6; i++) {
    const close = page.getByRole("button", {
      name: /^(Close dialog|Close worker details)$/,
    }).last();
    if (!await close.count()) break;
    const depth = await page.evaluate(() => history.state?.crewStudio?.depth);
    await close.click();
    await expect.poll(() =>
      page.evaluate(() => history.state?.crewStudio?.depth)
    ).not.toBe(depth);
  }
}
export async function openTask(page: Page, title: string) {
  await closePanels(page);
  await page.getByRole("button", { name: "Task list", exact: true }).click();
  const name = await page.evaluate((title) => {
    const s = JSON.parse(
      localStorage.getItem("crewcanvas.public-demo.v1") ??
        localStorage.getItem("crewcanvas.demo.v1")!,
    );
    return s.people.find((p: { id: string }) =>
      p.id ===
        s.projects.find((t: { title: string }) => t.title === title).workerId
    ).name;
  }, title);
  await page.getByRole("button", { name: `Open member ${name}`, exact: true })
    .first().click();
  await page.locator(".studio-task").filter({ hasText: title }).getByRole(
    "button",
    { name: "Task details →", exact: true },
  ).click();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
}
