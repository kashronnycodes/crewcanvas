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
  await page.getByRole("button", { name: "Project studio", exact: true })
    .click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await page.getByRole("button", { name: /^Open role / }).first().click();
  await page.getByRole("button", { name: /^Open member / }).first().click();
  await page.getByRole("button", { name: "Task details →", exact: true })
    .first().click();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
}
