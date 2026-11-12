// Explicit setup for the existing employer judging workspace only.
// Never run from signup, app startup, or ordinary workspace creation.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { projectClient } from "./project-client.mjs";

const state = JSON.parse(fs.readFileSync(new URL("../.supabase/judge-access.local.json", import.meta.url), "utf8"));
assert.equal(state.workspaceId, "0214b9d3-1b98-4ce0-8abe-94b3a1ef4b28");
const { admin } = projectClient();
const workspace = await admin.from("workspaces").select("name").eq("id", state.workspaceId).single();
assert.ifError(workspace.error);
assert.equal(workspace.data.name, "CrewCanvas Judging");
const owner = await admin.from("memberships").select("id,auth_user_id").eq("workspace_id", state.workspaceId).eq("access_role", "employer").single();
assert.ifError(owner.error);
assert.equal(owner.data.auth_user_id, state.accounts.find(a => a.key === "client").id);
const samples = [["designer", "Jamie Chen", "Designer"], ["editor", "Riley Santos", "Video editor"], ["producer", "Casey Morgan", "Producer"]];
for (const [key, name, role] of samples) {
  const result = await admin.rpc("add_sample_workspace_member", {
    p_actor_id: owner.data.id, p_id: randomUUID(), p_key: key, p_name: name, p_role: role,
  });
  assert.ifError(result.error);
}
const saved = await admin.from("memberships").select("id,auth_user_id,data").eq("workspace_id", state.workspaceId).contains("data", {sample:true});
assert.ifError(saved.error);
assert.equal(saved.data.length, samples.length);
assert(saved.data.every(p => p.auth_user_id === null && !p.data.authUserId));
console.log("Verified three persisted sample profiles in CrewCanvas Judging, with no Auth identity or account access.");
