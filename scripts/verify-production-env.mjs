// Read cloud metadata, then only the three approved public frontend values.
// No full environment export, local .env override, or secret file is used.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { projectClient, projectUrl } from "./project-client.mjs";
const { publicKey } = projectClient();
const projectId = "prj_S3Vfd7Joh1sOB6zRK09bj8XJnMg5";
const teamId = "team_qNOuwpfIbmBWuSpmPKuVtN5E";
function api(endpoint) {
  try {
    return JSON.parse(execFileSync(process.platform === "win32" ? "vercel.cmd" : "vercel",
      ["api", endpoint, "--raw"], {
        shell: process.platform === "win32", encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }));
  } catch { throw new Error("Public Vercel configuration read failed; CLI output withheld."); }
}
// This list endpoint does not request decryption. Unknown values are never fetched.
const metadata = api(`/v10/projects/${projectId}/env?teamId=${teamId}`);
const rows = metadata.envs ?? metadata;
assert.ok(Array.isArray(rows), "Expected Vercel environment metadata");
const production = rows.filter(row => row.target?.includes("production"));
const allowed = new Set(["VITE_APP_MODE", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
assert.ok(production.every(row => allowed.has(row.key)), "Review unexpected production environment names before reading values");
const values = {};
for (const name of allowed) {
  const matches = production.filter(row => row.key === name);
  assert.equal(matches.length, 1, `Expected one production setting for ${name}`);
  const row = matches[0];
  assert.match(row.id, /^[A-Za-z0-9_-]+$/, "Invalid environment metadata identifier");
  const result = api(`/v1/projects/${projectId}/env/${row.id}?teamId=${teamId}`);
  assert.equal(result.key, name, "Unexpected environment response");
  values[name] = result.value;
}
assert.equal(values.VITE_APP_MODE, "integrated", "Production must use integrated mode");
assert.equal(values.VITE_SUPABASE_URL, projectUrl, "Unexpected production Supabase project");
assert.equal(values.VITE_SUPABASE_PUBLISHABLE_KEY, publicKey, "Production public key does not match the verified project");
console.log("PASS cloud production configuration: integrated mode, exact project URL and matching publishable key; only the three approved public variables are configured.");
