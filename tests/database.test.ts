// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { IDS, seedWorkspace } from "../shared/seed";
import { activeAgreement, execute, uid } from "../shared/domain";
let db: PGlite;
const seed = seedWorkspace();
const authIds = seed.people.map(
  (_, i) => `60000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
async function asWorker(index: number) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    authIds[index],
  ]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;",
  );
  await db.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/20261028110143_initial_schema.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.query("insert into public.workspaces values($1,$2,$3)", [
    seed.id,
    seed.name,
    seed.timezone,
  ]);
  for (const [i, p] of seed.people.entries()) {
    await db.query("insert into auth.users values($1)", [authIds[i]]);
    await db.query(
      "insert into public.memberships(id,workspace_id,auth_user_id,access_role,data) values($1,$2,$3,$4,$5)",
      [p.id, seed.id, authIds[i], p.accessRole, JSON.stringify(p)],
    );
  }
  await db.query("insert into public.canvas_layouts values($1,0,$2)", [
    seed.id,
    JSON.stringify(seed.layout),
  ]);
  for (const p of seed.projects)
    await db.query("select public.commit_project($1,$2,-1,$3)", [
      IDS.myron,
      JSON.stringify(p),
      uid(),
    ]);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("database authorization and atomicity", () => {
  it("workers can read only their own membership and project records", async () => {
    await asWorker(1);
    const people = await db.query("select id from public.memberships");
    expect(people.rows).toEqual([{ id: IDS.ava }]);
    const projects = await db.query("select worker_id from public.projects");
    expect(projects.rows).toEqual([{ worker_id: IDS.ava }]);
    expect(
      (await db.query("select * from public.canvas_layouts")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.agreements")).rows,
    ).toHaveLength(1);
    await db.exec("reset role");
  });
  it("does not trust user-editable role claims", async () => {
    await asWorker(1);
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ user_metadata: { role: "employer" } }),
    ]);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      1,
    );
    await db.exec("reset role");
  });
  it("denies direct writes, privileged RPCs, private payment data and anonymous reads", async () => {
    await asWorker(1);
    await expect(
      db.query(
        'update public.projects set data=data||\'{"state":"accepted"}\'',
      ),
    ).rejects.toThrow();
    await expect(
      db.query("select public.commit_project($1,$2,0,$3)", [
        IDS.ava,
        JSON.stringify(seed.projects[0]),
        uid(),
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("select * from private.webhook_events"),
    ).rejects.toThrow();
    await db.exec("reset role;set role anon");
    await expect(db.query("select * from public.projects")).rejects.toThrow();
    await db.exec("reset role");
  });
  it("lets employers see their team but requires employer identity for layout saves", async () => {
    await asWorker(0);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      7,
    );
    await db.exec("reset role");
    await expect(
      db.query("select public.save_canvas($1,$2,0)", [
        IDS.ava,
        JSON.stringify(seed.layout),
      ]),
    ).rejects.toThrow("FORBIDDEN");
    const saved = await db.query<{ save_canvas: { version: number } }>(
      "select public.save_canvas($1,$2,0)",
      [IDS.myron, JSON.stringify(seed.layout)],
    );
    expect(saved.rows[0].save_canvas.version).toBe(1);
    await expect(
      db.query("select public.save_canvas($1,$2,0)", [
        IDS.myron,
        JSON.stringify(seed.layout),
      ]),
    ).rejects.toThrow("CONFLICT");
  });
  it("preserves accepted agreement records at the database boundary", async () => {
    const p = seed.projects[0];
    await expect(
      db.query(
        "update public.agreements set data=jsonb_set(data,'{amountMinor}','\"1\"') where id=$1",
        [activeAgreement(p)!.id],
      ),
    ).rejects.toThrow("immutable");
  });
  it("commits accepted additions once, keeps originals immutable, and rejects stale versions", async () => {
    const p = seed.projects.find((p) => p.workerId === IDS.ethan)!;
    const next = execute(
      p,
      {
        type: "decideProposal",
        projectId: p.id,
        proposalId: p.proposals[0].id,
        accept: true,
      },
      { id: IDS.myron, role: "employer", workspaceId: seed.id },
    );
    const request = uid();
    await db.query("select public.commit_project($1,$2,0,$3)", [
      IDS.myron,
      JSON.stringify(next),
      request,
    ]);
    const repeated = await db.query<{ commit_project: { duplicate: boolean } }>(
      "select public.commit_project($1,$2,0,$3)",
      [IDS.myron, JSON.stringify(next), request],
    );
    expect(repeated.rows[0].commit_project.duplicate).toBe(true);
    expect(
      (
        await db.query("select * from public.agreements where project_id=$1", [
          p.id,
        ])
      ).rows,
    ).toHaveLength(2);
    await expect(
      db.query("select public.commit_project($1,$2,0,$3)", [
        IDS.myron,
        JSON.stringify(next),
        uid(),
      ]),
    ).rejects.toThrow("CONFLICT");
  });
  it("handles duplicate webhook receipt and allows unfinished records to retry", async () => {
    await db.query(
      "insert into private.seller_connections(id,workspace_id,worker_id,merchant_id,email) values($1,$2,$3,$4,$5)",
      [IDS.seller, seed.id, IDS.ava, "TEST-MERCHANT", "seller@example.test"],
    );
    const payload = {
      eventId: "WH-TEST",
      sellerConnectionId: IDS.seller,
      providerId: "INV2-TEST",
      event: { id: "WH-TEST" },
    };
    await db.query("select public.provider_store('webhook_insert',$1)", [
      JSON.stringify(payload),
    ]);
    await db.query("select public.provider_store('webhook_insert',$1)", [
      JSON.stringify(payload),
    ]);
    expect(
      (await db.query("select * from private.webhook_events")).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select * from private.webhook_events where processed_at is null",
        )
      ).rows,
    ).toHaveLength(1);
    await db.query("select public.provider_store('webhook_done',$1)", [
      JSON.stringify({ eventId: "WH-TEST" }),
    ]);
    expect(
      (
        await db.query(
          "select * from private.webhook_events where processed_at is null",
        )
      ).rows,
    ).toHaveLength(0);
  });
});
