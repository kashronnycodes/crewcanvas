// Operator-only, never imported by the app or deployed as an HTTP endpoint.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { publicDemoWorkspace, DEMO_FILE_TEXT } from "../shared/publicDemo.ts";
import { demoTarget, assertDemoInventory, DEMO_MARKER } from "./demo-safety.mjs";

const { generation } = demoTarget(process.env);
const db = createClient(process.env.CREW_DEMO_SUPABASE_URL, process.env.CREW_DEMO_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const check = (result) => {
  if (result.error) throw new Error(`Demo setup failed (${result.error.code ?? result.error.status ?? "backend"}). No credentials logged; rerun after fixing configuration.`);
  return result.data;
};
// Paginate every isolation check; a truncated first page is not proof of isolation.
async function rows(table, columns) {
  const all = [];
  for (let offset = 0; ; offset += 500) {
    const page = check(await db.from(table).select(columns).order("id").range(offset, offset + 499));
    all.push(...page);
    if (page.length < 500) return all;
  }
}
const users = [];
for (let page = 1; ; page++) {
  const result = check(await db.auth.admin.listUsers({ page, perPage: 500 }));
  users.push(...result.users);
  if (result.users.length < 500) break;
}
const workspaces = await rows("workspaces", "id,name");
const memberships = await rows("memberships", "id,workspace_id,auth_user_id");
assertDemoInventory(workspaces, users, memberships);

// Each generation is a fresh workspace and distinct users. Reset never deletes or
// rewrites historical agreements, invoices, files, provider records or users.
function scopedId(id) {
  const hex = createHash("sha256").update(`${DEMO_MARKER}:${generation}:${id}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const seed = JSON.parse(JSON.stringify(publicDemoWorkspace()), (_key, value) =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? scopedId(value) : value
);
seed.name = `CrewCanvas Public Demo / ${generation}`;
const accounts = seed.people.map((person, i) => ({
  ...person, email: `crewcanvas.public-demo.g${generation}.${i === 0 ? "employer" : `freelancer-${i}`}@example.com`,
}));
if (process.argv.includes("--check")) {
  console.log("PASS dedicated target and complete workspace/Auth/membership inventory checks. No writes performed.");
  process.exit(0);
}
if (process.argv.slice(2).length) throw new Error("Only --check is supported. Restore clean state by choosing a new generation.");
check(await db.from("workspaces").upsert({ id: seed.id, name: seed.name, timezone: seed.timezone }, { ignoreDuplicates: true }));
for (const person of accounts) {
  let user = users.find((u) => u.email === person.email);
  if (!user) {
    user = check(await db.auth.admin.createUser({
      email: person.email, password: process.env.CREW_DEMO_PASSWORD, email_confirm: true,
      app_metadata: { crew_demo: DEMO_MARKER, generation },
    })).user;
  }
  if (!user || user.app_metadata?.crew_demo !== DEMO_MARKER || user.app_metadata?.generation !== generation) {
    throw new Error("Demo Auth identity mismatch. Refusing to adopt or change an existing user.");
  }
  const existing = check(await db.from("memberships").select("workspace_id,auth_user_id,access_role").eq("id", person.id).maybeSingle());
  if (existing) {
    if (existing.workspace_id !== seed.id || existing.auth_user_id !== user.id || existing.access_role !== person.accessRole) {
      throw new Error("Membership collision. No existing membership was modified.");
    }
  } else check(await db.from("memberships").insert({
    id: person.id, workspace_id: seed.id, auth_user_id: user.id, access_role: person.accessRole,
    data: { ...person, authUserId: user.id },
  }));
}
check(await db.from("canvas_layouts").upsert({ workspace_id: seed.id, version: 0, data: seed.layout }, { onConflict: "workspace_id", ignoreDuplicates: true }));
for (const project of seed.projects) {
  const existing = check(await db.from("projects").select("workspace_id").eq("id", project.id).maybeSingle());
  if (existing && existing.workspace_id !== seed.id) throw new Error("Project collision; refusing to modify it.");
  if (!existing) check(await db.rpc("commit_project", {
    p_actor_id: accounts[0].id, p_project: project, p_expected: -1, p_request_id: crypto.randomUUID(),
  }));
}
const file = seed.files[0];
const existingFile = check(await db.from("workspace_files").select("workspace_id").eq("id", file.id).maybeSingle());
if (existingFile && existingFile.workspace_id !== seed.id) throw new Error("File collision; refusing to modify it.");
if (!existingFile) {
  const path = `${seed.id}/${file.id}/sample.txt`;
  check(await db.storage.from("crewcanvas-files").upload(path, new TextEncoder().encode(DEMO_FILE_TEXT), { contentType: "text/plain", upsert: true }));
  file.versions[0].path = path;
  check(await db.rpc("mutate_workspace_file", { p_actor_id: accounts[1].id, p_file: file, p_expected: 0 }));
}
console.log("Demo setup complete. Existing project history and credentials preserved. Workspace:", seed.id);
for (const person of accounts) console.log(`${person.accessRole}: ${person.email}`);
console.log("Use the disposable password supplied in the operator environment. Never put the service key in VITE_ variables.");
