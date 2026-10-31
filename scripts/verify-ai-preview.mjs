// Verify a permitted CrewCanvas browser origin against the real API.
// This does not bypass Vercel protection or persist authentication credentials.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { projectClient, projectUrl } from "./project-client.mjs";
import { testSession } from "./test-session.mjs";
const origin = process.env.CREW_TEST_ORIGIN ??
  "https://crewcanvas-cr32blog9-kashronnycodes-projects.vercel.app";
assert.ok([
  "https://crewcanvas-cr32blog9-kashronnycodes-projects.vercel.app",
  "https://crewcanvas.vercel.app",
].includes(origin), "Only the verified CrewCanvas preview or production origin is permitted");
const fixture = JSON.parse(
  readFileSync(
    new URL("../.supabase/ai-fixtures.json", import.meta.url),
    "utf8",
  ),
);
const session = await testSession(0);
try {
  const snapshot = await session.request(
    "snapshot",
    undefined,
    fixture.workspaceId,
  );
  assert.match(snapshot.name, /^Synthetic AI fixtures [0-9]+$/);
  assert.equal(snapshot.files.length, 0);
  assert.equal(snapshot.projects.length, 1);
  assert.ok(
    snapshot.people.every((p) =>
      /^crewcanvas\.(employer|freelancer)\.[0-9]+@example\.com$/.test(p.email)
    ),
  );
  const project = snapshot.projects[0];
  assert.equal(project.id, fixture.projectId);
  assert.equal(project.title, "Synthetic AI launch card");
  assert.ok(
    project.agreements.every((a) =>
      a.brief ===
        "SYNTHETIC TEST DATA: Design one launch card. Correct spelling errors. One design concept only. Additional concepts are excluded."
    ),
  );
  assert.equal(
    project.deliveries.length + project.revisions.length +
      project.invoices.length,
    0,
  );
  const url = `${projectUrl}/functions/v1/crew-api/ai/workspace`;
  const preflight = await fetch(url, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "authorization,apikey,content-type,x-workspace-id",
    },
    signal: AbortSignal.timeout(15000),
  });
  assert.ok([200, 204].includes(preflight.status));
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  const { publicKey } = projectClient();
  const auth = await session.client.auth.getSession();
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(60000),
    headers: {
      Origin: origin,
      apikey: publicKey,
      Authorization: `Bearer ${auth.data.session.access_token}`,
      "Content-Type": "application/json",
      "X-Workspace-Id": fixture.workspaceId,
    },
    body: JSON.stringify({
      text:
        "Summarize the recorded synthetic project progress and pending reviews.",
    }),
  });
  const answer = await response.json();
  assert.equal(response.status, 200, answer.error?.message);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal(answer.mode, "live");
  assert.equal(answer.intent, "summary");
  assert.ok(answer.text.length > 10);
  writeFileSync(
    new URL("../.supabase/gemini-preview.json", import.meta.url),
    JSON.stringify(
      {
        preview: origin,
        preflight: preflight.status,
        api: response.status,
        mode: answer.mode,
        summary: answer.text,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${origin}: CORS preflight, real authenticated Gemini summary and live response contract.`,
  );
} finally {
  await session.close();
}
