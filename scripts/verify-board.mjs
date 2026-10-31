// Synthetic objects only. Never creates invoices, changes terms or settles payments.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { newBoardData } from "../shared/board.ts";
import { testSession } from "./test-session.mjs";
const fixture = JSON.parse(
  readFileSync(
    new URL("../.supabase/ai-fixtures.json", import.meta.url),
    "utf8",
  ),
);
const owner = await testSession(0),
  worker = await testSession(1),
  outsider = await testSession(2);
const sessions = [owner, worker, outsider],
  channels = [],
  events = [[], [], []];
const projectId = fixture.projectId, objectId = randomUUID();
const check = (name) => console.log(`PASS ${name}`);
async function waitFor(condition, message) {
  const until = Date.now() + 20000;
  while (!condition() && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(condition(), message);
}
try {
  const snapshot = await owner.request(
    "snapshot",
    undefined,
    fixture.workspaceId,
  );
  assert.match(snapshot.name, /^Synthetic AI fixtures /);
  assert.ok(
    snapshot.projects.some((p) =>
      p.id === projectId && p.title === "Synthetic AI launch card"
    ),
  );
  const assigned = await worker.client.from("projects").select("id").eq(
    "id",
    projectId,
  );
  assert.ifError(assigned.error);
  assert.equal(
    assigned.data.length,
    1,
    "Synthetic worker fixture must be assigned to this project",
  );
  for (const [i, session] of sessions.entries()) {
    const channel = session.client.channel(`verify-board:${i}:${objectId}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "board_objects",
        filter: `project_id=eq.${projectId}`,
      },
      (event) => events[i].push(event),
    );
    channels.push(channel);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Realtime subscription timed out")),
        15000,
      );
      channel.subscribe((status, error) => {
        if (error) console.log(`Realtime ${i}: ${error.message}`);
        if (status === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  }
  const created = await owner.client.from("board_objects").insert({
    id: objectId,
    project_id: projectId,
    data: { ...newBoardData("note", 100, 120), text: "Synthetic client idea" },
  }).select().single();
  assert.ifError(created.error);
  await waitFor(
    () => events[1].some((e) => e.new.id === objectId),
    "Assigned freelancer did not receive the client note",
  );
  check("authorized client-to-freelancer persistent Realtime update");
  const denied = await outsider.client.from("board_objects").select("*").eq(
    "id",
    objectId,
  );
  assert.ifError(denied.error);
  assert.equal(denied.data.length, 0);
  const deniedWrite = await outsider.client.from("board_objects").insert({
    project_id: projectId,
    data: newBoardData("note"),
  });
  assert.ok(deniedWrite.error);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(events[2].length, 0);
  check("unauthorized reads, writes and Realtime event delivery denied");
  const updated = await worker.client.from("board_objects").update({
    version: 2,
    data: { ...created.data.data, text: "Synthetic freelancer refinement" },
  }).eq("id", objectId).eq("version", 1).select().single();
  assert.ifError(updated.error);
  await waitFor(
    () => events[0].some((e) => e.new.id === objectId && e.new.version === 2),
    "Client did not receive freelancer update",
  );
  const stale = await owner.client.from("board_objects").update({
    version: 2,
    data: created.data.data,
  }).eq("id", objectId).eq("version", 1).select();
  assert.ifError(stale.error);
  assert.equal(stale.data.length, 0);
  check("bidirectional updates and stale-write conflict protection");
  const comment = await worker.client.from("board_comments").insert({
    object_id: objectId,
    body: "Synthetic non-binding feedback",
    author_name: "forged",
  }).select().single();
  assert.ifError(comment.error);
  assert.notEqual(comment.data.author_name, "forged");
  const resolved = await owner.client.from("board_comments").update({
    resolved: true,
  }).eq("id", comment.data.id).select().single();
  assert.ifError(resolved.error);
  assert.equal(resolved.data.resolved, true);
  const deleted = await worker.client.from("board_objects").update({
    version: 3,
    deleted: true,
  }).eq("id", objectId).eq("version", 2).select().single();
  assert.ifError(deleted.error);
  await waitFor(
    () => events[0].some((e) => e.new.id === objectId && e.new.deleted),
    "Soft delete did not reach client",
  );
  check(
    "anchored feedback, attribution, resolution and soft-delete synchronization",
  );
  // Credential preparation is opt-in and restricted to labeled synthetic accounts.
  if (process.argv.includes("--prepare-browser")) {
    const logins = [];
    for (const session of [owner, worker]) {
      const user = (await session.client.auth.getUser()).data.user;
      assert.match(
        user.email,
        /^crewcanvas\.(employer|freelancer)\.[0-9]+@example\.com$/,
      );
      const password = `CrewCanvas-${randomBytes(24).toString("base64url")}!`;
      const result = await session.admin.auth.admin.updateUserById(user.id, {
        password,
      });
      assert.ifError(result.error);
      logins.push({ email: user.email, password });
    }
    writeFileSync(
      new URL(
        "../.supabase/board-browser-accounts.local.json",
        import.meta.url,
      ),
      JSON.stringify(
        { projectId, workspaceId: fixture.workspaceId, logins },
        null,
        2,
      ),
    );
    check(
      "synthetic browser accounts prepared; credentials remain in ignored local state",
    );
  }
} finally {
  for (const [i, channel] of channels.entries()) {
    await sessions[i].client.removeChannel(channel);
  }
  for (const session of sessions) await session.close();
}
