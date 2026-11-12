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
      db.query("select public.configure_reconciliation($1)", ["fake-test-key"]),
    ).rejects.toThrow();
    await expect(db.query("select public.backend_service_authorized()")).rejects
      .toThrow();
    await expect(
      db.query(
        "update public.memberships set access_role='employer' where id=$1",
        [workerMember],
      ),
    ).rejects.toThrow();
    await db.exec("reset role");
    await db.exec("set role service_role");
    expect(
      (await db.query<{ allowed: boolean }>(
        "select public.backend_service_authorized() as allowed",
      )).rows[0].allowed,
    ).toBe(true);
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
  it("allows first-time seller setup without permitting duplicate merchant mappings", async () => {
    await db.exec("set role service_role");
    expect(
      (await db.query<{ id: string | null }>(
        "select public.configured_sandbox_seller('SYNTHETIC-MERCHANT','seller@example.com') as id",
      )).rows[0].id,
    ).toBeNull();
    const id = uid();
    await db.query("select public.provider_store('configure_seller',$1)", [
      JSON.stringify({
        id,
        workspaceId: ws,
        workerId: workerMember,
        merchantId: "SYNTHETIC-MERCHANT",
        email: "seller@example.com",
      }),
    ]);
    expect(
      (await db.query<{ id: string }>(
        "select public.configured_sandbox_seller('SYNTHETIC-MERCHANT','SELLER@example.com') as id",
      )).rows[0].id,
    ).toBe(id);
    await expect(
      db.query("select public.provider_store('configure_seller',$1)", [
        JSON.stringify({
          id: uid(),
          workspaceId: other,
          workerId: ownerMember,
          merchantId: "SYNTHETIC-MERCHANT",
          email: "another@example.com",
        }),
      ]),
    ).rejects.toThrow();
    await asUser(worker);
    await expect(
      db.query(
        "select public.configured_sandbox_seller('SYNTHETIC-MERCHANT','seller@example.com')",
      ),
    )
      .rejects.toThrow();
    await db.exec("reset role");
  });
});

describe.sequential("deliberate manual team setup", () => {
  const manualId = uid(), authId = uid(), inviteHash = "f".repeat(64);
  it("creates one manual person, retries safely and rejects blank and duplicate submissions", async () => {
    await db.exec("reset role; set role service_role");
    await db.query("select public.add_workspace_member($1,$2,'manual@example.com','Manual Person','Producer')", [ownerMember, manualId]);
    await db.query("select public.add_workspace_member($1,$2,'manual@example.com','Manual Person','Producer')", [ownerMember, manualId]);
    const rows = (await db.query<{auth_user_id:string|null;data:any}>("select * from public.memberships where id=$1", [manualId])).rows;
    expect(rows).toHaveLength(1); expect(rows[0].auth_user_id).toBeNull(); expect(rows[0].data.authUserId).toBeUndefined();
    await expect(db.query("select public.add_workspace_member($1,$2,'MANUAL@example.com','Other Person','Editor')", [ownerMember, uid()])).rejects.toThrow("CONFLICT");
    await expect(db.query("select public.add_workspace_member($1,$2,'blank@example.com','  ','Editor')", [ownerMember, uid()])).rejects.toThrow("VALIDATION");
    await expect(db.query("select public.add_workspace_member($1,$2,'bad-email','Person','Editor')", [ownerMember, uid()])).rejects.toThrow("VALIDATION");
    await expect(db.query("select public.add_workspace_member($1,$2,'new@example.com','Person','Editor')", [workerMember, uid()])).rejects.toThrow("FORBIDDEN");
  });
  it("keeps the original member ID, role, profile and assignments when account access is accepted", async () => {
    await db.exec("reset role");
    await db.query("insert into auth.users values($1,'manual@example.com',now())", [authId]);
    const assignedId = uid();
    await db.query("insert into public.projects(id,workspace_id,worker_id,data) values($1,$2,$3,$4)", [assignedId,ws,manualId,{...project,id:assignedId,workerId:manualId}]);
    await db.exec("set role service_role");
    await db.query("select public.invite_workspace_member($1,$2,'manual@example.com','Invitation name','Invitation role',$3)", [ownerMember, uid(), inviteHash]);
    await expect(db.query("select public.accept_workspace_invite($1,$2)", [outsider, inviteHash])).rejects.toThrow("FORBIDDEN");
    await db.query("select public.accept_workspace_invite($1,$2)", [authId, inviteHash]);
    await db.query("select public.accept_workspace_invite($1,$2)", [authId, inviteHash]);
    const rows = (await db.query<{id:string;data:any}>("select * from public.memberships where auth_user_id=$1", [authId])).rows;
    expect(rows).toHaveLength(1); expect(rows[0].id).toBe(manualId);
    expect(rows[0].data).toMatchObject({name:"Manual Person",role:"Producer",authUserId:authId});
    expect((await db.query<{worker_id:string}>("select worker_id from public.projects where id=$1",[assignedId])).rows[0].worker_id).toBe(manualId);
    // The owner's access and other existing members remain intact.
    expect((await db.query("select id from public.memberships where id=$1 and access_role='employer'", [ownerMember])).rows).toHaveLength(1);
  });
  it("does not expose the member creation RPC to a signed-in freelancer", async () => {
    await asUser(worker);
    await expect(db.query("select public.add_workspace_member($1,$2,'attempt@example.com','Person','Editor')", [ownerMember, uid()])).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });
});

describe.sequential("sample planning profiles and unassigned tasks", () => {
  const sampleId = uid();
  let planning: Project;
  it("seeds sample profiles idempotently with no Auth identity, only in the requested workspace", async () => {
    await db.exec("reset role; set role service_role");
    const first = await db.query<{add_sample_workspace_member:string}>("select public.add_sample_workspace_member($1,$2,'sample-designer','Sample Designer','Designer')", [ownerMember, sampleId]);
    const retry = await db.query<{add_sample_workspace_member:string}>("select public.add_sample_workspace_member($1,$2,'sample-designer','Sample Designer','Designer')", [ownerMember, uid()]);
    expect(first.rows[0].add_sample_workspace_member).toBe(sampleId);
    expect(retry.rows[0].add_sample_workspace_member).toBe(sampleId);
    const samples = (await db.query<{auth_user_id:null;data:any}>("select * from public.memberships where data->'sample'='true'::jsonb and workspace_id=$1", [ws])).rows;
    expect(samples).toHaveLength(1); expect(samples[0].auth_user_id).toBeNull(); expect(samples[0].data.authUserId).toBeUndefined();
    expect((await db.query("select id from public.memberships where workspace_id=$1 and data->'sample'='true'::jsonb",[other])).rows).toHaveLength(0);
    await expect(db.query("update public.memberships set data=data||jsonb_build_object('authUserId',$2::text) where id=$1",[sampleId,worker])).rejects.toThrow("sample_members_have_no_account");
  });
  it("persists explicit null assignment, then assigns, changes and clears without rewriting existing tasks", async () => {
    const existing = await db.query("select id,worker_id,data from public.projects where id=$1",[project.id]);
    planning = {...project,id:uid(),workerId:null,title:"Plan before hiring",state:"awaiting_agreement",activeAgreementId:null,agreements:[],deliveries:[],revisions:[],proposals:[],invoices:[],activity:[],version:0};
    await db.query("select public.commit_project($1,$2,-1,$3)",[ownerMember,planning,uid()]);
    let saved = (await db.query<{worker_id:string|null;data:any}>("select worker_id,data from public.projects where id=$1",[planning.id])).rows[0];
    expect(saved.worker_id).toBeNull(); expect(saved.data.workerId).toBeNull();
    for (const assignee of [sampleId, workerMember, null]) {
      const next=execute(planning,{type:"assignTask",projectId:planning.id,workerId:assignee},{id:ownerMember,workspaceId:ws,role:"employer"});
      await db.query("select public.commit_project($1,$2,$3,$4)",[ownerMember,next,planning.version,uid()]);
      planning=next;
      saved=(await db.query<{worker_id:string|null;data:any}>("select worker_id,data from public.projects where id=$1",[planning.id])).rows[0];
      expect(saved.worker_id).toBe(assignee); expect(saved.data.workerId).toBe(assignee);
    }
    expect((await db.query("select id,worker_id,data from public.projects where id=$1",[project.id])).rows).toEqual(existing.rows);
  });
  it("denies worker reads and even privileged-RPC writes to an unassigned task, and rejects invalid assignees", async () => {
    await db.exec("reset role; set role service_role");
    await expect(db.query("select public.commit_project($1,$2,$3,$4)",[workerMember,{...planning,version:planning.version+1},planning.version,uid()])).rejects.toThrow("FORBIDDEN");
    await expect(db.query("select public.commit_project($1,$2,$3,$4)",[ownerMember,{...planning,workerId:ownerMember,version:planning.version+1},planning.version,uid()])).rejects.toThrow("invalid assignee");
    await asUser(worker);
    expect((await db.query("select id from public.projects where id=$1",[planning.id])).rows).toHaveLength(0);
    await expect(db.query("select public.add_sample_workspace_member($1,$2,'fake','Sample','Editor')",[ownerMember,uid()])).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });
});
