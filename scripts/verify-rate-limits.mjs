// Independent PostgreSQL sessions in a disposable local container. Never targets
// the production website, Supabase project, credentials or existing containers.
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const args = process.argv.slice(2);
if (!args.includes("--docker") || args.some(arg => !["--docker", "--advisors"].includes(arg))) throw new Error("Use --docker for an isolated, disposable local PostgreSQL test.");
const advisors = args.includes("--advisors");
const container = `crewcanvas-rate-test-${randomUUID()}`;
const label = "crewcanvas.rate-limit-test=true";
function run(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let out = "", err = "";
    child.stdout.on("data", data => out += data);
    child.stderr.on("data", data => err += data);
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(out.trim()) : reject(new Error(`Local docker test failed: ${err.slice(0,1000)}`)));
    child.stdin.end(input);
  });
}
const sql = text => run(["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1"], text);
let created = false;
try {
  await run(["run", "--detach", "--rm", "--name", container, "--label", label,
    ...(advisors ? ["--publish", "127.0.0.1::5432"] : ["--network", "none"]),
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"]);
  created = true;
  for (let i = 0; ; i++) {
    try { await run(["exec", container, "pg_isready", "-U", "postgres"]); break; }
    catch (error) { if (i >= 30) throw error; await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  const identity = randomUUID(), other = randomUUID();
  await sql(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key);
    create schema private;grant usage on schema private to service_role;
    create table public.memberships(id uuid primary key,auth_user_id uuid,workspace_id uuid,access_role text);
    create table public.projects(id uuid primary key,workspace_id uuid,worker_id uuid);
    create table private.ai_limits(actor_id uuid,minute timestamptz,requests integer);
    insert into auth.users values('${identity}'),('${other}');`);
  await sql("begin;\n" + readFileSync(new URL("../supabase/migrations/20261107000230_api_rate_limits.sql", import.meta.url), "utf8") + "\ncommit;");
  const take = (id = identity) => sql(`set role service_role; select public.api_rate_limit('${id}',array['api','payment_issue'],'{"api":120,"payment_issue":5}')->>'allowed';`)
    .then(out => out.split(/\r?\n/).at(-1) === "true");
  // Hold the target minute open comfortably; no sleep across a window boundary.
  const seconds = Number(await sql("select extract(second from clock_timestamp())::integer;"));
  if (seconds > 45) await new Promise(resolve => setTimeout(resolve, (61 - seconds) * 1000));
  const start = Number(await sql("select floor(extract(epoch from clock_timestamp())/60);"));
  const allowed = await Promise.all(Array.from({ length: 16 }, () => take()));
  const end = Number(await sql("select floor(extract(epoch from clock_timestamp())/60);"));
  assert.equal(start, end, "Test crossed a minute boundary; rerun instead of accepting misleading results.");
  assert.equal(allowed.filter(Boolean).length, 5, "Exactly five admissions across independent concurrent sessions");
  assert.equal(await take(other), true, "Another Auth user has an independent quota");
  assert.equal(Number(await sql(`select requests from private.api_rate_counters where auth_user_id='${identity}' and policy='payment_issue';`)), 5);
  const denied = JSON.parse((await sql(`select public.api_rate_limit('${identity}',array['payment_issue'],'{"payment_issue":5}');`)).split(/\r?\n/).at(-1));
  assert.equal(denied.allowed, false);
  assert.ok(denied.retryAfter >= 1 && denied.retryAfter <= 60);
  const project = randomUUID(), actor = randomUUID(), workspace = randomUUID();
  await sql(`insert into public.memberships values('${actor}','${identity}','${workspace}','worker');
    insert into public.projects values('${project}','${workspace}','${actor}');
    grant select on public.memberships,public.projects to service_role;`);
  const projectCalls = await Promise.all(Array.from({ length: 8 }, () => sql(`set role service_role; select public.api_rate_limit('${identity}',array['payment_issue_project'],'{"payment_issue_project":2}','${project}')->>'allowed';`)));
  assert.equal(projectCalls.filter(out => out.split(/\r?\n/).at(-1) === "true").length, 2);
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(sql(`set role ${role}; select public.api_rate_limit('${identity}',array['api'],'{"api":120}');`), /permission denied/);
  }
  console.log("PASS PostgreSQL 17: 16 independent concurrent sessions, exactly 5 payment requests admitted; 8 project requests, exactly 2 admitted. User isolation, saturated counters, Retry-After and RPC privileges verified.");
  if (advisors) {
    const port = await run(["inspect", "--format", '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}', container]);
    assert.match(port, /^[0-9]{1,5}$/);
    const output = execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", [
      "--yes", "supabase@2.122.0", "db", "advisors", "--db-url", `postgresql://postgres@127.0.0.1:${port}/postgres?sslmode=disable`, "--type", "security", "--fail-on", "error",
    ], { encoding: "utf8", shell: process.platform === "win32", windowsHide: true });
    console.log(output);
  }
} finally {
  if (created) {
    const ownLabel = await run(["inspect", "--format", '{{index .Config.Labels "crewcanvas.rate-limit-test"}}', container]);
    assert.equal(ownLabel, "true", "Refusing cleanup of an unrelated container");
    await run(["rm", "--force", container]);
  }
}
