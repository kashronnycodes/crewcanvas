import { createClient } from "@supabase/supabase-js";
import { seedWorkspace, IDS } from "../shared/seed.ts";
const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CREW_SEED_PASSWORD",
];
for (const name of required)
  if (!process.env[name])
    throw new Error(
      `Set ${name} in the shell. Never use VITE_ variables for secrets.`,
    );
if (process.env.CREW_SEED_PASSWORD.length < 12)
  throw new Error("Use a seed password of at least 12 characters.");
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const seed = seedWorkspace();
const check = async (result) => {
  if (result.error) throw result.error;
  return result.data;
};
await check(
  await db
    .from("workspaces")
    .upsert({ id: seed.id, name: seed.name, timezone: seed.timezone }),
);
for (const person of seed.people) {
  const existing = await check(
    await db
      .from("memberships")
      .select("auth_user_id")
      .eq("id", person.id)
      .maybeSingle(),
  );
  if (existing?.auth_user_id) continue;
  const created = await db.auth.admin.createUser({
    email: person.email,
    password: process.env.CREW_SEED_PASSWORD,
    email_confirm: true,
  });
  if (created.error)
    throw new Error(
      `Could not provision ${person.name}: ${created.error.message}`,
    );
  await check(
    await db
      .from("memberships")
      .insert({
        id: person.id,
        workspace_id: seed.id,
        auth_user_id: created.data.user.id,
        access_role: person.accessRole,
        data: { ...person, authUserId: created.data.user.id, connected: false },
      }),
  );
}
const layout = await check(
  await db
    .from("canvas_layouts")
    .select("workspace_id")
    .eq("workspace_id", seed.id)
    .maybeSingle(),
);
if (!layout)
  await check(
    await db
      .from("canvas_layouts")
      .insert({ workspace_id: seed.id, version: 0, data: seed.layout }),
  );
for (const [index, p] of seed.projects.entries()) {
  p.id = `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
  const existing = await check(
    await db.from("projects").select("id").eq("id", p.id).maybeSingle(),
  );
  if (existing) continue;
  await check(
    await db.rpc("commit_project", {
      p_actor_id: IDS.myron,
      p_project: p,
      p_expected: -1,
      p_request_id: crypto.randomUUID(),
    }),
  );
}
if (process.env.PAYPAL_MERCHANT_ID && process.env.PAYPAL_SELLER_EMAIL) {
  await check(
    await db.rpc("provider_store", {
      p_action: "configure_seller",
      p_payload: {
        id: IDS.seller,
        workspaceId: seed.id,
        workerId: IDS.ava,
        merchantId: process.env.PAYPAL_MERCHANT_ID,
        email: process.env.PAYPAL_SELLER_EMAIL,
      },
    }),
  );
}
console.log(
  "Northstar Creative seeded. Existing projects, accounts, layouts, invoices, and events were preserved.",
);
console.log(
  "Presenter sign-ins: myron@northstar.example and ava@northstar.example. Use the password provided in your shell.",
);
