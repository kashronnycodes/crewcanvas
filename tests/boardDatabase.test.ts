// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { IDS, seedWorkspace } from "../shared/seed";
import { uid } from "../shared/domain";
import {
  boardDataSchema,
  historyTarget,
  mergeBoardRows,
  newBoardData,
} from "../shared/board";
const seed = seedWorkspace(), authIds = seed.people.map(() => uid());
let db: PGlite;
const first = uid(), second = uid();
async function actor(index: number) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    authIds[index],
  ]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);",
  );
  for (
    const name of [
      "20261028110143_initial_schema.sql",
      "20261030210134_intelligent_canvas.sql",
      "20261031221200_project_whiteboards.sql",
    ]
  ) {
    await db.exec(
      readFileSync(
        new URL(`../supabase/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
  }
  await db.query("insert into public.workspaces values($1,$2,$3)", [
    seed.id,
    seed.name,
    seed.timezone,
  ]);
  for (const [i, person] of seed.people.entries()) {
    await db.query("insert into auth.users values($1)", [authIds[i]]);
    await db.query(
      "insert into public.memberships(id,workspace_id,auth_user_id,access_role,data) values($1,$2,$3,$4,$5)",
      [
        person.id,
        seed.id,
        authIds[i],
        person.accessRole,
        JSON.stringify(person),
      ],
    );
  }
  for (const project of seed.projects) {
    await db.query("select public.commit_project($1,$2,-1,$3)", [
      IDS.myron,
      JSON.stringify(project),
      uid(),
    ]);
  }
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("project whiteboard authorization, persistence and conflicts", () => {
  it("persists a note for the assigned freelancer and client, never peer freelancers", async () => {
    await actor(1);
    await db.query(
      "insert into public.board_objects(id,project_id,data) values($1,$2,$3)",
      [
        first,
        seed.projects[0].id,
        JSON.stringify(newBoardData("note", 80, 90)),
      ],
    );
    expect((await db.query("select id from public.board_objects")).rows)
      .toEqual([{ id: first }]);
    await actor(0);
    expect((await db.query("select id from public.board_objects")).rows)
      .toEqual([{ id: first }]);
    await actor(2);
    expect((await db.query("select * from public.board_objects")).rows)
      .toHaveLength(0);
    await expect(
      db.query(
        "insert into public.board_objects(project_id,data) values($1,$2)",
        [seed.projects[0].id, JSON.stringify(newBoardData("note"))],
      ),
    ).rejects.toThrow();
  });
  it("rejects stale updates and preserves edits to separate objects", async () => {
    await actor(0);
    await db.query(
      "insert into public.board_objects(id,project_id,data) values($1,$2,$3)",
      [second, seed.projects[0].id, JSON.stringify(newBoardData("text"))],
    );
    await actor(1);
    await db.query(
      "update public.board_objects set version=2,data=$2 where id=$1 and version=1",
      [
        first,
        JSON.stringify({
          ...newBoardData("note", 80, 90),
          text: "Freelancer draft",
        }),
      ],
    );
    await actor(0);
    expect(
      (await db.query(
        "update public.board_objects set version=2,data=$2 where id=$1 and version=1 returning id",
        [first, JSON.stringify(newBoardData("note"))],
      )).rows,
    ).toHaveLength(0);
    await db.query(
      "update public.board_objects set version=2,data=$2 where id=$1 and version=1",
      [
        second,
        JSON.stringify({ ...newBoardData("text"), text: "Client idea" }),
      ],
    );
    const result = await db.query<{ data: { text: string } }>(
      "select data from public.board_objects order by data->>'text'",
    );
    expect(result.rows.map((row) => row.data.text)).toEqual([
      "Client idea",
      "Freelancer draft",
    ]);
  });
  it("validates drawings, dimensions, links and object schemas at the database boundary", async () => {
    await actor(1);
    const stroke = { ...newBoardData("stroke"), points: [[0, 0], [20, 30]] };
    await db.query(
      "insert into public.board_objects(project_id,data) values($1,$2)",
      [seed.projects[0].id, JSON.stringify(stroke)],
    );
    for (
      const data of [
        { ...stroke, points: [[-1, 0]] },
        { ...stroke, url: "javascript:alert(1)" },
        { ...stroke, width: 100000 },
        { ...stroke, kind: null },
        { ...stroke, extra: "provider credential" },
      ]
    ) {
      await expect(
        db.query(
          "insert into public.board_objects(project_id,data) values($1,$2)",
          [seed.projects[0].id, JSON.stringify(data)],
        ),
      ).rejects.toThrow();
    }
  });
  it("keeps connectors in the same authorized project", async () => {
    await actor(0);
    const other = uid();
    await db.query(
      "insert into public.board_objects(id,project_id,data) values($1,$2,$3)",
      [other, seed.projects[1].id, JSON.stringify(newBoardData("note"))],
    );
    await expect(
      db.query(
        "insert into public.board_objects(project_id,data) values($1,$2)",
        [
          seed.projects[0].id,
          JSON.stringify({
            ...newBoardData("connector"),
            source: first,
            target: other,
          }),
        ],
      ),
    ).rejects.toThrow("Invalid connector endpoint");
    await db.query(
      "insert into public.board_objects(project_id,data) values($1,$2)",
      [
        seed.projects[0].id,
        JSON.stringify({
          ...newBoardData("connector"),
          source: first,
          target: second,
        }),
      ],
    );
  });
  it("allows scoped feedback and replies with server-derived author attribution", async () => {
    await actor(1);
    const comment = uid();
    await db.query(
      "insert into public.board_comments(id,object_id,body,author_name) values($1,$2,'Feedback, not a paid revision','Forged client')",
      [comment, first],
    );
    const row = await db.query<{ author_name: string; author_id: string }>(
      "select author_name,author_id from public.board_comments where id=$1",
      [comment],
    );
    expect(row.rows[0]).toEqual({
      author_name: seed.people[1].name,
      author_id: authIds[1],
    });
    await actor(0);
    await db.query(
      "insert into public.board_comments(object_id,body,author_name,reply_to) values($1,'Reply','ignored',$2)",
      [first, comment],
    );
    await db.query(
      "update public.board_comments set resolved=true where id=$1",
      [comment],
    );
    await actor(2);
    expect((await db.query("select * from public.board_comments")).rows)
      .toHaveLength(0);
    await expect(
      db.query(
        "insert into public.board_comments(object_id,body,author_name) values($1,'intrusion','x')",
        [first],
      ),
    ).rejects.toThrow();
  });
  it("does not allow changing attribution, scope, financial records or hard deletion", async () => {
    await actor(1);
    await expect(
      db.query("update public.board_objects set project_id=$2 where id=$1", [
        first,
        seed.projects[1].id,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("update public.board_objects set author_id=$2 where id=$1", [
        first,
        authIds[0],
      ]),
    ).rejects.toThrow();
    await expect(
      db.query("update public.board_objects set version=1 where id=$1", [
        first,
      ]),
    ).rejects.toThrow("CONFLICT");
    await expect(
      db.query("delete from public.board_objects where id=$1", [first]),
    ).rejects.toThrow();
    await expect(db.exec("update public.invoices set paid_minor=125")).rejects
      .toThrow();
    await db.exec("reset role; set role anon");
    await expect(db.exec("select * from public.board_objects")).rejects
      .toThrow();
  });
  it("supports soft-delete/restore without replaying domain operations", async () => {
    await actor(1);
    await db.query(
      "update public.board_objects set version=3,deleted=true where id=$1 and version=2",
      [first],
    );
    await actor(0);
    const deleted = await db.query(
      "select deleted from public.board_objects where id=$1",
      [first],
    );
    expect(deleted.rows).toEqual([{ deleted: true }]);
    await db.query(
      "update public.board_objects set version=4,deleted=false where id=$1 and version=3",
      [first],
    );
    expect(
      (await db.query(
        "select data->>'text' as text from public.board_objects where id=$1",
        [first],
      )).rows,
    ).toEqual([{ text: "Freelancer draft" }]);
  });
});
describe("whiteboard contracts", () => {
  it("rejects unknown executable content and merges only newer object versions", () => {
    expect(
      boardDataSchema.safeParse({ ...newBoardData("note"), command: "pay" })
        .success,
    ).toBe(false);
    const row = {
      id: uid(),
      project_id: uid(),
      author_id: uid(),
      updated_by: uid(),
      data: newBoardData("note"),
      version: 2,
      deleted: false,
      updated_at: "now",
    };
    expect(mergeBoardRows([row], [{ ...row, version: 1 }])).toEqual([row]);
    expect(
      historyTarget(
        { id: row.id, before: null, after: row.data, version: 1 },
        true,
      ),
    ).toBeNull();
  });
});
