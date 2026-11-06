// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { uid } from "../shared/domain";
let db: PGlite;
const workspace = uid(), worker = uid(), seller = uid(), identity = uid();
beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;");
  for (const migration of ["20261028110143_initial_schema.sql", "20261106215714_api_rate_limits.sql"]) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
  }
  await db.query("insert into auth.users values($1)", [identity]);
  await db.query("insert into public.workspaces values($1,'Synthetic webhook regression','UTC')", [workspace]);
  await db.query("insert into public.memberships values($1,$2,$3,'worker',$4)", [worker, workspace, identity, JSON.stringify({ id: worker })]);
  await db.query("select public.provider_store('configure_seller',$1)", [JSON.stringify({ id: seller, workspaceId: workspace, workerId: worker, merchantId: "SYNTHETIC", email: "sandbox@example.com" })]);
}, 30000);
afterAll(async () => { await db?.close(); });
it("preserves durable webhook deduplication, retries and completion without consuming user quotas", async () => {
  const payload = { eventId: "SYNTHETIC-WEBHOOK-1", sellerConnectionId: seller, providerId: "INV2-SYNTHETIC", event: { id: "SYNTHETIC-WEBHOOK-1" } };
  for (let i = 0; i < 3; i++) await db.query("select public.provider_store('webhook_insert',$1)", [JSON.stringify(payload)]);
  expect((await db.query("select * from private.webhook_events")).rows).toHaveLength(1);
  await db.query("select public.provider_store('webhook_error',$1)", [JSON.stringify({ eventId: payload.eventId, error: "temporary synthetic retry" })]);
  const pending = await db.query<{ result: { attempts: number }[] }>("select public.provider_store('webhook_pending','{}') as result");
  expect(pending.rows[0].result[0].attempts).toBe(1);
  await db.query("select public.provider_store('webhook_done',$1)", [JSON.stringify({ eventId: payload.eventId })]);
  const duplicate = await db.query<{ result: { processed_at: string } }>("select public.provider_store('webhook_insert',$1) as result", [JSON.stringify(payload)]);
  expect(duplicate.rows[0].result.processed_at).toBeTruthy();
  expect((await db.query("select * from private.api_rate_counters")).rows).toHaveLength(0);
  const handler = readFileSync(new URL("../supabase/functions/paypal-webhook/index.ts", import.meta.url), "utf8");
  expect(handler).not.toContain("enforceRateLimit");
  expect(handler).toContain("verifyWebhookSignature");
});
