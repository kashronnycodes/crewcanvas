// Read-only hosted browser smoke checks; no PayPal issuance/payment or domain mutation.
import { chromium, webkit, devices } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { testSession } from "./test-session.mjs";
import { projectUrl } from "./project-client.mjs";
const origin = process.env.CREW_RELEASE_ORIGIN;
assert.ok(origin === "https://crewcanvas.vercel.app" || /^https:\/\/crewcanvas-[a-z0-9]+-kashronnycodes-projects\.vercel\.app$/.test(origin ?? ""), "Only CrewCanvas preview/production origins are permitted");
const preview = origin !== "https://crewcanvas.vercel.app";
const cookies = preview ? readFileSync(new URL("../.supabase/preview-cookies.local.txt", import.meta.url), "utf8")
  .split(/\r?\n/).filter(line => line.split("\t").length >= 7).map(line => {
    const [rawDomain,, path, secure, expiry, name, value] = line.split("\t");
    return { domain: rawDomain.replace("#HttpOnly_", ""), path, secure: secure === "TRUE", expires: Number(expiry) || -1, name, value, httpOnly: rawDomain.startsWith("#HttpOnly_") };
  }) : [];
const passed = [];
const check = name => { passed.push(name); console.log("PASS", name); };
for (const [engine, device] of [[chromium, {}], [chromium, devices["Pixel 5"]], [webkit, devices["iPhone 12"]]]) {
  const browser = await engine.launch();
  const context = await browser.newContext(device);
  try {
    if (cookies.length) await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByLabel("Email address").waitFor();
    assert.ok(await page.getByRole("heading", { name: "Explore CrewCanvas" }).isVisible());
    assert.ok(await page.getByText(/Simulated demo · synthetic data only/).isVisible());
    await page.getByRole("link", { name: "Use this account: Employer Demo", exact: true }).click();
    await page.getByLabel("Demo viewing role").waitFor();
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    assert.ok(await page.getByRole("button", { name: "New project" }).isVisible());
    await page.reload();
    await page.getByLabel("Demo viewing role").waitFor();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "Use this account: Freelancer Demo 1", exact: true }).click();
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("button", { name: "Thumbnails", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Podcast highlights", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "New project" }).count(), 0);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.getByRole("button", { name: "Use this account: Freelancer Demo 2", exact: true }).click();
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    await page.getByRole("button", { name: "Podcast highlights", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Thumbnails", exact: true }).count(), 0);
    const authKey = `sb-${new URL(projectUrl).hostname.split(".")[0]}-auth-token`;
    assert.equal(await page.evaluate(key => localStorage.getItem(key), authKey), null, "Simulation must not create a Supabase session");
    check(`${engine.name()} ${device.isMobile ? "mobile" : "desktop"}: real sign-in page, labeled simulation, three roles, refresh and switching`);
  } finally { await context.close(); await browser.close(); }
}
if (!process.argv.includes("--simulation-only")) {
  for (const index of [0, 1]) {
    const session = await testSession(index);
    const browser = await chromium.launch();
    const context = await browser.newContext();
    try {
      if (cookies.length) await context.addCookies(cookies);
      const { data } = await session.client.auth.getSession();
      assert.ok(data.session);
      const snapshot = await session.request("snapshot");
      const key = `sb-${new URL(projectUrl).hostname.split(".")[0]}-auth-token`;
      await context.addInitScript(({ key, value, userId, workspaceId }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
        sessionStorage.setItem(`crewcanvas.workspace.${userId}`, workspaceId);
      }, { key, value: JSON.stringify(data.session), userId: data.session.user.id, workspaceId: session.fixtures.workspaceId });
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByText("Integrated · Sandbox", { exact: false }).first().waitFor();
      assert.equal(await page.getByRole("button", { name: "New project" }).count(), index === 0 ? 1 : 0);
      await page.getByRole("button", { name: "Projects", exact: true }).click();
      await page.getByRole("button", { name: "Project whiteboard" }).click();
      await page.getByLabel("Whiteboard project").waitFor();
      await page.reload();
      await page.getByText("Integrated · Sandbox", { exact: false }).first().waitFor();
      if (index === 1) assert.ok(snapshot.projects.every(p => p.workerId === snapshot.actorId));
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.getByLabel("Email address").waitFor();
      check(`real Supabase ${index === 0 ? "employer" : "freelancer"}: workspace, role restrictions, whiteboard, refresh, logout`);
    } finally { await context.close(); await browser.close(); await session.close(); }
  }
}
writeFileSync(new URL(`../.supabase/${preview ? "preview" : "production"}-browser-release.local.json`, import.meta.url), JSON.stringify({ origin, at: new Date().toISOString(), passed }, null, 2));
