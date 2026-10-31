// Runs against the explicitly verified hackathon project. Credentials stay in memory.
import { createClient } from "@supabase/supabase-js";
import {
  projectClient,
  projectRef as ref,
  projectUrl as url,
} from "./project-client.mjs";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const origin = process.env.CREW_TEST_ORIGIN ?? "http://127.0.0.1:5173";
const { publicKey, admin: db } = projectClient();
const stamp = Date.now();
let passed = [];
const check = (label) => {
  passed.push(label);
  console.log(`PASS ${label}`);
};
async function account(label) {
  const email = `crewcanvas.${label}.${stamp}@example.com`,
    password = randomBytes(24).toString("base64url");
  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const client = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return {
    email,
    id: created.data.user.id,
    client,
    token: signed.data.session.access_token,
  };
}
async function request(
  user,
  path,
  body,
  workspace,
  expected = 200,
  id = randomUUID(),
) {
  const response = await fetch(`${url}/functions/v1/crew-api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: publicKey,
      Origin: origin,
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...(workspace ? { "X-Workspace-Id": workspace } : {}),
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "Idempotency-Key": id,
    },
    body: body === undefined
      ? undefined
      : body instanceof FormData
      ? body
      : JSON.stringify(body),
  });
  const value = await response.json();
  assert.equal(
    response.status,
    expected,
    `${path}: ${value.error?.message ?? response.status}`,
  );
  return value;
}
const owner = await account("employer"),
  worker = await account("freelancer"),
  other = await account("other");
check("three distinct real Auth accounts can sign in");
await request(null, "snapshot", undefined, null, 401);
check("anonymous API access denied");
const workspaceId = randomUUID();
await request(
  owner,
  "workspaces/create",
  {
    name: `Integration studio ${stamp}`,
    personName: "Integration Employer",
    timezone: "Asia/Manila",
  },
  null,
  200,
  workspaceId,
);
await request(
  owner,
  "workspaces/create",
  {
    name: `Integration studio ${stamp}`,
    personName: "Integration Employer",
    timezone: "Asia/Manila",
  },
  null,
  200,
  workspaceId,
);
check("workspace creation persists and is idempotent");
const otherWorkspace = (await request(other, "workspaces/create", {
  name: `Other studio ${stamp}`,
  personName: "Other Employer",
  timezone: "UTC",
})).workspaceId;
const invite = await request(owner, "invite", {
  email: worker.email,
  name: "Integration Freelancer",
  role: "Designer",
}, workspaceId);
const invitationToken = new URL(invite.url).searchParams.get("join");
await request(other, "invites/accept", { token: invitationToken }, null, 403);
await request(worker, "invites/accept", { token: invitationToken });
await request(worker, "invites/accept", { token: invitationToken });
check("email-bound invitation and replay protection");
let s = await request(owner, "snapshot", undefined, workspaceId);
const freelancer = s.people.find((p) => p.accessRole === "worker");
assert.ok(freelancer);
await request(owner, "workspaces/update", {
  name: `Updated integration studio ${stamp}`,
  timezone: "Asia/Manila",
}, workspaceId);
await request(owner, "members/update", {
  id: freelancer.id,
  name: "Integration Freelancer",
  role: "Senior Designer",
}, workspaceId);
await request(
  worker,
  "members/update",
  { id: freelancer.id, name: "Forged", role: "Owner" },
  workspaceId,
  403,
);
assert.equal(
  (await request(owner, "members", undefined, workspaceId))[0].accessRole,
  "worker",
);
assert.equal(
  (await request(owner, "snapshot", undefined, workspaceId)).name,
  `Updated integration studio ${stamp}`,
);
check(
  "workspace settings and member labels persist without granting new roles",
);
await request(owner, "command", {
  type: "createProject",
  workerId: freelancer.id,
  title: "Integration launch card",
  publish: true,
  terms: {
    brief: "Design and deliver the launch card.",
    tasks: ["Design launch card"],
    deliverables: ["Final design file"],
    amountMinor: "12000",
    currency: "USD",
    deadline: "2026-12-20",
    revisionRounds: 2,
    paymentDays: 7,
  },
}, workspaceId);
s = await request(owner, "snapshot", undefined, workspaceId);
let p = s.projects[0];
assert.equal(p.state, "awaiting_agreement");
await request(worker, "command", {
  type: "decideAgreement",
  projectId: p.id,
  agreementId: p.agreements[0].id,
  accept: true,
}, workspaceId);
check("project assignment and bilateral agreement persisted");
await request(other, "snapshot", undefined, workspaceId, 403);
await request(worker, "snapshot", undefined, otherWorkspace, 403);
const forbiddenRead = await other.client.from("projects").select("id").eq(
  "workspace_id",
  workspaceId,
);
assert.ifError(forbiddenRead.error);
assert.equal(forbiddenRead.data.length, 0);
const forged = await worker.client.from("memberships").update({
  access_role: "employer",
}).eq("id", freelancer.id);
assert.ok(forged.error);
check("cross-workspace API/RLS isolation and direct role escalation denied");
const layout = { ...s.layout, cards: [{ id: `task:${p.id}`, x: 123, y: 456 }] };
await request(owner, "layout", layout, workspaceId);
assert.equal(
  (await request(owner, "snapshot", undefined, workspaceId)).layout.cards[0].x,
  123,
);
check("canvas world coordinates persist");
async function upload(text, replace) {
  const form = new FormData();
  form.set("file", new Blob([text], { type: "text/plain" }), "launch-card.txt");
  form.set("id", replace?.id ?? randomUUID());
  form.set("projectId", p.id);
  form.set("expected", String(replace?.version ?? 0));
  form.set("x", "123");
  form.set("y", "456");
  return request(worker, "files/upload", form, workspaceId);
}
let file = await upload("launch card v1");
assert.ok(file.id);
assert.equal(file.versions.length, 1);
const signed = await request(worker, "files/url", {
  id: file.id,
  version: 0,
  download: false,
}, workspaceId);
assert.equal(await (await fetch(signed.url)).text(), "launch card v1");
assert.notEqual(
  (await fetch(
    `${url}/storage/v1/object/public/crewcanvas-files/${file.versions[0].path}`,
  )).status,
  200,
);
check("private Storage upload and authorized signed download");
await request(worker, "command", {
  type: "submitFileDelivery",
  projectId: p.id,
  fileId: file.id,
  fileVersion: 0,
  label: "v1",
  note: "First design",
}, workspaceId);
await request(owner, "command", {
  type: "requestRevision",
  projectId: p.id,
  text: "Correct the heading spelling.",
  items: [{
    text: "Correct the heading spelling.",
    classification: "likely_included",
    explanation: "Correction within the accepted design.",
    uncertainty: "low",
    sources: [],
  }],
}, workspaceId);
let ws = await request(worker, "snapshot", undefined, workspaceId);
let revision = ws.projects[0].revisions[0];
await request(worker, "command", {
  type: "respondRevision",
  projectId: p.id,
  revisionId: revision.id,
  itemId: revision.items[0].id,
  disposition: "included",
  note: "Included spelling correction.",
  waiveRound: false,
}, workspaceId);
file = await upload("launch card v2 — spelling corrected", file);
assert.equal(file.versions.length, 2);
await request(worker, "command", {
  type: "submitFileDelivery",
  projectId: p.id,
  fileId: file.id,
  fileVersion: 1,
  label: "v2",
  note: "Spelling corrected",
}, workspaceId);
s = await request(owner, "snapshot", undefined, workspaceId);
p = s.projects[0];
await request(owner, "command", {
  type: "acceptDelivery",
  projectId: p.id,
  deliveryId: p.deliveries.at(-1).id,
}, workspaceId);
s = await request(owner, "snapshot", undefined, workspaceId);
assert.equal(s.projects[0].state, "accepted");
assert.equal(s.files[0].versions.length, 2);
assert.equal(s.projects[0].deliveries[0].fileVersion, 0);
check(
  "delivery → revision → replacement → resubmission → employer approval persists",
);
assert.ok(s.notifications.length);
await request(
  owner,
  "notifications/read",
  { id: s.notifications[0].id },
  workspaceId,
);
assert.ok(
  (await request(owner, "snapshot", undefined, workspaceId)).notifications[0]
    .read_at,
);
check("database-backed notification and read status");
await request(
  worker,
  "command",
  { type: "simulatePayment", projectId: p.id, invoiceId: randomUUID() },
  workspaceId,
  400,
);
const retained =
  (await request(worker, "snapshot", undefined, workspaceId)).files[0];
await request(
  worker,
  "files/update",
  {
    id: retained.id,
    expected: retained.version,
    name: retained.name,
    projectId: p.id,
    remove: true,
  },
  workspaceId,
  409,
);
check(
  "integrated simulation commands and deletion of submitted evidence rejected",
);
await owner.client.auth.signOut();
await request(owner, "snapshot", undefined, workspaceId, 401);
check("signed-out session denied");
mkdirSync(".supabase", { recursive: true });
writeFileSync(
  ".supabase/integration-results.json",
  JSON.stringify(
    {
      projectRef: ref,
      testedAt: new Date().toISOString(),
      workspaceId,
      otherWorkspace,
      projectId: p.id,
      accounts: [owner, worker, other].map((a) => ({
        id: a.id,
        email: a.email,
      })),
      passed,
    },
    null,
    2,
  ),
);
console.log(
  `${passed.length} live integration checks passed. Test fixtures retained; no user records were deleted.`,
);
