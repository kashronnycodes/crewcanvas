// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { IDS, seedWorkspace } from "../shared/seed";
import { uid } from "../shared/domain";
import type { WorkspaceFile } from "../shared/types";
let db: PGlite;
const s = seedWorkspace(), authIds = s.people.map(() => uid());
const file: WorkspaceFile = {
  id: uid(),
  workspaceId: s.id,
  projectId: s.projects[0].id,
  uploadedBy: s.projects[0].workerId,
  name: "work.pdf",
  mime: "application/pdf",
  size: 100,
  x: 25,
  y: 55,
  version: 1,
  versions: [{
    path: "private/v1.pdf",
    name: "work.pdf",
    mime: "application/pdf",
    size: 100,
    createdAt: "2026-10-31T00:00:00Z",
  }],
  createdAt: "2026-10-31T00:00:00Z",
  updatedAt: "2026-10-31T00:00:00Z",
};
async function mutate(
  actor: string,
  value: WorkspaceFile,
  expected: number,
  remove = false,
) {
  return db.query("select public.mutate_workspace_file($1,$2,$3,$4)", [
    actor,
    JSON.stringify(value),
    expected,
    remove,
  ]);
}
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
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);",
  );
  for (
    const migration of [
      "20261028110143_initial_schema.sql",
      "20261030210134_intelligent_canvas.sql",
    ]
  ) {
    await db.exec(
      readFileSync(
        new URL(`../supabase/migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  }
  await db.query("insert into public.workspaces values($1,$2,$3)", [
    s.id,
    s.name,
    s.timezone,
  ]);
  for (const [i, p] of s.people.entries()) {
    await db.query("insert into auth.users values($1)", [authIds[i]]);
    await db.query(
      "insert into public.memberships(id,workspace_id,auth_user_id,access_role,data) values($1,$2,$3,$4,$5)",
      [p.id, s.id, authIds[i], p.accessRole, JSON.stringify(p)],
    );
  }
  await db.query("insert into public.canvas_layouts values($1,0,$2)", [
    s.id,
    JSON.stringify(s.layout),
  ]);
  for (const p of s.projects) {
    await db.query("select public.commit_project($1,$2,-1,$3)", [
      IDS.myron,
      JSON.stringify(p),
      uid(),
    ]);
  }
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("private files and workspace audit migration", () => {
  it("uses a private bucket with a size limit and records file creation atomically", async () => {
    expect(
      (await db.query("select public,file_size_limit from storage.buckets"))
        .rows,
    ).toEqual([{ public: false, file_size_limit: 26214400 }]);
    await mutate(file.uploadedBy, file, 0);
    expect((await db.query("select * from public.workspace_files")).rows)
      .toHaveLength(1);
    expect((await db.query("select * from public.workspace_activity")).rows)
      .toHaveLength(1);
  });
  it("isolates peer file reads, denies direct writes and RPC access", async () => {
    await asWorker(1);
    expect((await db.query("select * from public.workspace_files")).rows)
      .toHaveLength(1);
    await expect(db.exec("delete from public.workspace_files")).rejects
      .toThrow();
    await expect(mutate(file.uploadedBy, { ...file, version: 2 }, 1)).rejects
      .toThrow();
    await asWorker(2);
    expect((await db.query("select * from public.workspace_files")).rows)
      .toHaveLength(0);
    expect((await db.query("select * from public.workspace_activity")).rows)
      .toHaveLength(0);
    await db.exec("reset role");
  });
  it("rejects worker uploads into peers' projects and forged workspace identity", async () => {
    await expect(
      mutate(IDS.leo, { ...file, id: uid(), uploadedBy: IDS.leo }, 0),
    ).rejects.toThrow("FORBIDDEN");
    await expect(mutate(IDS.ava, { ...file, id: uid(), workspaceId: uid() }, 0))
      .rejects.toThrow("FORBIDDEN");
    expect((await db.query("select * from public.workspace_activity")).rows)
      .toHaveLength(1);
  });
  it("serializes replacement versions, rejects stale updates and preserves audit history", async () => {
    const replacement = {
      ...file,
      version: 2,
      versions: [...file.versions, {
        ...file.versions[0],
        path: "private/v2.pdf",
      }],
    };
    await mutate(IDS.ava, replacement, 1);
    await expect(mutate(IDS.ava, replacement, 1)).rejects.toThrow("CONFLICT");
    const row = await db.query<{ data: WorkspaceFile }>(
      "select data from public.workspace_files",
    );
    expect(row.rows[0].data.versions).toHaveLength(2);
    await expect(db.exec("delete from public.workspace_activity")).rejects
      .toThrow("append-only");
    await expect(
      mutate(IDS.ava, {
        ...replacement,
        version: 3,
        versions: [{ ...file.versions[0], path: "tampered.pdf" }],
      }, 2),
    ).rejects.toThrow("immutable");
  });
  it("removes dangling layout cards/connections on deletion and denies anonymous reads", async () => {
    const layout = {
      ...s.layout,
      cards: [{ id: `file:${file.id}`, x: 10, y: 20 }],
      connections: [{
        id: uid(),
        source: `task:${file.projectId}`,
        target: `file:${file.id}`,
      }],
    };
    await db.query("update public.canvas_layouts set data=$1", [
      JSON.stringify(layout),
    ]);
    const row = await db.query<{ data: WorkspaceFile }>(
      "select data from public.workspace_files",
    );
    await mutate(IDS.myron, { ...row.rows[0].data, version: 3 }, 2, true);
    const saved = await db.query<
      { data: { cards: unknown[]; connections: unknown[] } }
    >("select data from public.canvas_layouts");
    expect(saved.rows[0].data.cards).toEqual([]);
    expect(saved.rows[0].data.connections).toEqual([]);
    await asWorker(1);
    expect((await db.query("select * from public.workspace_files")).rows)
      .toHaveLength(0);
    await db.exec("reset role;set role anon");
    await expect(db.exec("select * from public.workspace_files")).rejects
      .toThrow();
    await db.exec("reset role");
  });
  it("pins submitted evidence and prevents deletion or project reassignment afterward", async () => {
    const evidenceId = uid(), otherFile = { ...file, id: uid(), version: 1 };
    await mutate(IDS.ava, otherFile, 0);
    const delivery = { id: evidenceId, fileId: otherFile.id, fileVersion: 0 };
    await db.query("insert into public.deliveries values($1,$2,$3)", [
      evidenceId,
      file.projectId,
      JSON.stringify(delivery),
    ]);
    await expect(mutate(IDS.myron, { ...otherFile, version: 2 }, 1, true))
      .rejects.toThrow("retained");
    await expect(
      mutate(IDS.myron, {
        ...otherFile,
        version: 2,
        projectId: s.projects[1].id,
      }, 1),
    ).rejects.toThrow("retained");
    await expect(
      db.query("update public.deliveries set data=$1 where id=$2", [
        JSON.stringify({ ...delivery, fileVersion: 1 }),
        evidenceId,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("insert into public.deliveries values($1,$2,$3)", [
        uid(),
        s.projects[1].id,
        JSON.stringify({ ...delivery, id: uid() }),
      ]),
    ).rejects.toThrow();
  });
});
