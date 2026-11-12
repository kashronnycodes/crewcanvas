export const DEMO_MARKER = "crewcanvas-public-demo-v1";
export function demoTarget(env) {
  const ref = env.CREW_DEMO_PROJECT_REF;
  if (!/^[a-z]{20}$/.test(ref ?? "") || ref === "tsnwowlyrlxpwwetmxns") {
    throw new Error("Use a NEW dedicated demo project, never the current CrewCanvas project.");
  }
  if (env.CREW_DEMO_SUPABASE_URL !== `https://${ref}.supabase.co`) {
    throw new Error("The demo URL must exactly match the dedicated project reference.");
  }
  if (env.CREW_DEMO_ISOLATION !== "synthetic-only" || env.PAYPAL_ENVIRONMENT !== "sandbox") {
    throw new Error("Confirm synthetic-only isolation and sandbox PayPal before provisioning.");
  }
  if (!env.CREW_DEMO_SERVICE_ROLE_KEY || (env.CREW_DEMO_PASSWORD?.length ?? 0) < 16) {
    throw new Error("Provide a server-only service role key and a disposable password of at least 16 characters.");
  }
  const generation = env.CREW_DEMO_GENERATION ?? "1";
  if (!/^[1-9][0-9]{0,5}$/.test(generation)) throw new Error("Use a positive demo generation (1–999999).");
  return { ref, generation };
}

export function assertDemoInventory(workspaces, users, memberships) {
  if (workspaces.some((w) => !/^CrewCanvas Public Demo \/ [1-9][0-9]{0,5}$/.test(w.name))) {
    throw new Error("Unrelated workspaces found. This project is not isolated; no writes performed.");
  }
  if (users.some((u) => u.app_metadata?.crew_demo !== DEMO_MARKER)) {
    throw new Error("Unrelated Auth users found. This project is not isolated; no writes performed.");
  }
  if (memberships.some((m) => !workspaces.some((w) => w.id === m.workspace_id) || !users.some((u) => u.id === m.auth_user_id))) {
    throw new Error("Unrelated memberships found; no writes performed.");
  }
}
