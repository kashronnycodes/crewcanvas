// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { uid } from "../shared/domain";
let db: PGlite;
const user = uid(), other = uid(), actor = uid(), secondActor = uid();
async function take(identity = user, policies = ["api"], limits = { api: 3 }, scope?: string) {
  return (await db.query<{ result: { allowed: boolean; retryAfter: number } }>(
    "select public.api_rate_limit($1,$2,$3,coalesce($4::uuid,'00000000-0000-0000-0000-000000000000')) as result",
    [identity, policies, JSON.stringify(limits), scope ?? null],
  )).rows[0].result;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema private;grant usage on schema private to service_role;create table public.memberships(id uuid primary key,auth_user_id uuid,workspace_id uuid,access_role text);create table public.projects(id uuid primary key,workspace_id uuid,worker_id uuid);create table private.ai_limits(actor_id uuid,minute timestamptz,requests integer);");
  await db.query("insert into auth.users values($1),($2)", [user, other]);
  await db.query("insert into public.memberships values($1,$2,$3,'worker'),($4,$2,$5,'worker')", [actor, user, uid(), secondActor, uid()]);
  // Current actor quota already used before rolling migration must not reset.
  await db.query("insert into private.ai_limits values($1,date_trunc('minute',now()),4),($2,date_trunc('minute',now()),3)", [actor, secondActor]);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261107000230_api_rate_limits.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
describe.sequential("distributed limiter SQL and privileges", () => {
  it("admits only the limit, separates users and returns valid retry seconds", async () => {
    expect((await take()).allowed).toBe(true);
    expect((await take()).allowed).toBe(true);
    expect((await take()).allowed).toBe(true);
    const denied = await take();
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfter).toBeLessThanOrEqual(60);
    expect((await take(other)).allowed).toBe(true);
  });
  it("a queued burst cannot over-admit or grow counters past the cap", async () => {
    // PGlite executes PostgreSQL locally; independent-session locking is verified
    // separately by scripts/verify-rate-limits.mjs against disposable Postgres.
    const identity = uid();
    await db.query("insert into auth.users values($1)", [identity]);
    const results = await Promise.all(Array.from({ length: 24 }, () => take(identity, ["upload"], { upload: 10 } as never)));
    expect(results.filter(r => r.allowed)).toHaveLength(10);
    expect((await db.query<{ requests: number }>("select requests from private.api_rate_counters where auth_user_id=$1", [identity])).rows[0].requests).toBe(10);
  });
  it("reuses ai_allow once across workspace actors with a safe old boolean contract", async () => {
    for (let i = 0; i < 3; i++) {
      const result = await db.query<{ result: boolean }>("select public.provider_store('ai_allow',$1) as result", [JSON.stringify({ actorId: i % 2 ? actor : secondActor })]);
      expect(result.rows[0].result).toBe(true);
    }
    const result = await db.query<{ result: { allowed: boolean } }>("select public.provider_store('ai_allow',$1) as result", [JSON.stringify({ actorId: actor, details: true })]);
    expect(result.rows[0].result.allowed).toBe(false);
    expect((await db.query("select to_regclass('private.ai_limits') as old")).rows[0]).toEqual({ old: null });
  });
  it("rotates in place and cleans expired rows in bounded batches", async () => {
    await db.query("update private.api_rate_counters set window_start=now()-interval '2 minutes' where auth_user_id=$1 and policy='api'", [user]);
    expect((await take()).allowed).toBe(true);
    expect((await db.query("select * from private.api_rate_counters where auth_user_id=$1 and policy='api'", [user])).rows).toHaveLength(1);
    await db.query("update private.api_rate_counters set expires_at=now()-interval '1 day'");
    const result = (await db.query<{ n: number }>("select public.cleanup_api_rate_limits() as n")).rows[0];
    expect(result.n).toBeGreaterThan(0);
    expect(result.n).toBeLessThanOrEqual(100);
  });
  it("rejects unknown policies, out-of-range limits and unauthorized project scopes", async () => {
    await expect(take(user, ["untrusted"], { untrusted: 10 } as never)).rejects.toThrow();
    await expect(take(user, ["api"], { api: 0 })).rejects.toThrow();
    await expect(take(user, ["api"], { api: 10001 })).rejects.toThrow();
    await expect(take(user, ["payment_issue_project"], { payment_issue_project: 2 } as never, uid())).rejects.toThrow("Project access denied");
  });
  it("a delayed request cannot rewind a counter already advanced to a newer window", async () => {
    const identity = uid();
    await db.query("insert into auth.users values($1)", [identity]);
    await take(identity);
    await db.query("update private.api_rate_counters set window_start=date_trunc('minute',now())+interval '1 minute' where auth_user_id=$1", [identity]);
    expect((await take(identity)).allowed).toBe(false);
    expect((await db.query<{ requests: number; future: boolean }>("select requests,window_start>clock_timestamp() as future from private.api_rate_counters where auth_user_id=$1", [identity])).rows[0]).toEqual({ requests: 1, future: true });
  });
  it("denies browser roles both counter access and RPC execution", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(take()).rejects.toThrow();
      await expect(db.query("select * from private.api_rate_counters")).rejects.toThrow();
      await expect(db.query("select public.provider_store('ai_allow','{}')")).rejects.toThrow();
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    expect((await take()).allowed).toBe(true);
    await db.exec("reset role");
  });
});
