// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { execute, makeAgreement, uid } from "../shared/domain";
import type { Project } from "../shared/types";
let db: PGlite;
const owner = uid(),
  worker = uid(),
  outsider = uid(),
  ws = uid(),
  other = uid(),
  hash = "a".repeat(64);
let ownerMember: string, workerMember: string, project: Project;
async function asUser(id: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);",
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (
    const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
  ) await db.exec(readFileSync(new URL(file, dir), "utf8"));
  for (
    const [id, email] of [[owner, "owner@example.com"], [
      worker,
      "worker@example.com",
    ], [outsider, "other@example.com"]]
  ) await db.query("insert into auth.users values($1,$2,now())", [id, email]);
  await db.exec("set role service_role");
  await db.query(
    "select public.create_workspace($1,$2,'Studio','Owner','Asia/Manila')",
    [owner, ws],
  );
  await db.query(
    "select public.create_workspace($1,$2,'Other Studio','Other','UTC')",
    [outsider, other],
  );
  await db.exec("reset role");
  ownerMember = (await db.query<{ id: string }>(
    "select id from public.memberships where auth_user_id=$1",
    [owner],
  )).rows[0].id;
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("onboarding, tenant isolation and notifications", () => {
  it("creates a workspace atomically and safely retries the same ID", async () => {
    await db.query(
      "select public.create_workspace($1,$2,'Studio','Owner','Asia/Manila')",
      [owner, ws],
    );
    expect(
      (await db.query(
        "select * from public.memberships where workspace_id=$1",
        [ws],
      )).rows,
    ).toHaveLength(1);
    await expect(
      db.query("select public.create_workspace($1,$2,'Studio','Other','UTC')", [
        outsider,
        ws,
      ]),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("binds an invitation to the verified email and accepts only once", async () => {
    await db.query(
      "select public.invite_workspace_member($1,$2,'worker@example.com','Worker','Designer',$3)",
      [ownerMember, uid(), hash],
    );
    await expect(
      db.query("select public.accept_workspace_invite($1,$2)", [
        outsider,
        hash,
      ]),
    ).rejects.toThrow("FORBIDDEN");
    await db.exec("set role service_role");
    await db.query("select public.accept_workspace_invite($1,$2)", [
      worker,
      hash,
    ]);
    await db.exec("reset role");
    await db.query("select public.accept_workspace_invite($1,$2)", [
      worker,
      hash,
    ]);
    workerMember = (await db.query<{ id: string }>(
      "select id from public.memberships where auth_user_id=$1",
      [worker],
    )).rows[0].id;
    expect(
      (await db.query(
        "select * from public.memberships where workspace_id=$1",
        [ws],
      )).rows,
    ).toHaveLength(2);
    const layout = (await db.query<{ data: { people: unknown[] } }>(
      "select data from public.canvas_layouts where workspace_id=$1",
      [ws],
    )).rows[0].data;
    expect(layout.people).toHaveLength(1);
    await expect(
      db.query(
        "select public.invite_workspace_member($1,$2,'x@example.com','Other','Designer',$3)",
        [workerMember, uid(), "b".repeat(64)],
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("keeps the same account's memberships scoped to distinct workspaces", async () => {
    await db.query(
      "select public.create_workspace($1,$2,'Worker Studio','Worker','UTC')",
      [worker, uid()],
    );
    expect(
      (await db.query(
        "select * from public.memberships where auth_user_id=$1",
        [worker],
      )).rows,
    ).toHaveLength(2);
  });
  it("denies direct client writes and access to privileged onboarding RPCs", async () => {
    await asUser(worker);
    await expect(
      db.query(
        "select public.create_workspace($1,$2,'Forged','Forged','UTC')",
        [outsider, uid()],
      ),
    ).rejects.toThrow();
    await expect(db.query("select * from private.workspace_invites")).rejects
      .toThrow();
    await expect(
      db.query(
        "update public.memberships set access_role='employer' where id=$1",
        [workerMember],
      ),
    ).rejects.toThrow();
    await db.exec("reset role");
  });
  it("persists workflow events and creates one recipient notification per event", async () => {
    const a = makeAgreement(
      {
        brief: "Design the launch card",
        deliverables: ["Design file"],
        amountMinor: "1000",
        currency: "USD",
        deadline: "2026-12-01",
        revisionRounds: 2,
        paymentDays: 7,
      },
      ownerMember,
      null,
    );
    a.status = "proposed";
    project = {
      id: uid(),
      workspaceId: ws,
      workerId: workerMember,
      title: "Launch card",
      state: "awaiting_agreement",
      origin: "sandbox",
      activeAgreementId: null,
      agreements: [a],
      deliveries: [],
      revisions: [],
      proposals: [],
      invoices: [],
      activity: [{
        id: uid(),
        actorId: ownerMember,
        text: "Assigned the launch card.",
        createdAt: new Date().toISOString(),
      }],
      version: 0,
    };
    const request = uid();
    await db.query("select public.commit_project($1,$2,-1,$3)", [
      ownerMember,
      JSON.stringify(project),
      request,
    ]);
    await db.query("select public.commit_project($1,$2,-1,$3)", [
      ownerMember,
      JSON.stringify(project),
      request,
    ]);
    expect(
      (await db.query(
        "select * from public.notifications where recipient_id=$1 and project_id=$2",
        [workerMember, project.id],
      )).rows,
    ).toHaveLength(1);
    project = execute(project, {
      type: "decideAgreement",
      projectId: project.id,
      agreementId: a.id,
      accept: true,
    }, { id: workerMember, role: "worker", workspaceId: ws });
    await db.query("select public.commit_project($1,$2,0,$3)", [
      workerMember,
      JSON.stringify(project),
      uid(),
    ]);
    expect(
      (await db.query(
        "select * from public.notifications where recipient_id=$1 and project_id=$2",
        [ownerMember, project.id],
      )).rows,
    ).toHaveLength(1);
  });
  it("enforces workspace and recipient isolation with actual PostgreSQL RLS", async () => {
    await asUser(outsider);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      0,
    );
    expect((await db.query("select * from public.notifications")).rows)
      .toHaveLength(0);
    await asUser(worker);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(
      1,
    );
    const inbox = await db.query<{ recipient_id: string }>(
      "select recipient_id from public.notifications",
    );
    expect(inbox.rows.every((n) => n.recipient_id === workerMember)).toBe(true);
    await expect(db.query("update public.notifications set read_at=now()"))
      .rejects.toThrow();
    await db.exec("reset role");
  });
});
