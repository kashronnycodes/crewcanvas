import { describe, expect, it } from "vitest";
import { publicDemoWorkspace, DEMO_ACCOUNTS } from "../shared/publicDemo";
import { execute } from "../shared/domain";
// @ts-expect-error Operator-only ESM module has no TS declaration.
import { demoTarget, assertDemoInventory, DEMO_MARKER } from "../scripts/demo-safety.mjs";

describe("public demo safety and useful fixtures", () => {
  it("seeds two isolated freelancers with a real file reference, revision fee and payment status", () => {
    const seed = publicDemoWorkspace();
    expect(seed.people.map(p => p.id)).toEqual(DEMO_ACCOUNTS.map(a => a.id));
    expect(new Set(seed.projects.map(p => p.workerId)).size).toBe(2);
    expect(seed.projects[0].deliveries[0].fileId).toBe(seed.files![0].id);
    expect(seed.projects[0].proposals[0].amountMinor).toBe("2000");
    expect(seed.projects[1].invoices[0].state).toBe("partial");
    expect(seed.projects[2].agreements[0].status).toBe("proposed");
    const peer = { id: seed.people[2].id, role: "worker" as const, workspaceId: seed.id };
    expect(() => execute(seed.projects[0], { type: "discuss", projectId: seed.projects[0].id, text: "private" }, peer)).toThrow();
  });
  it("refuses the current backend, mismatched URL, unconfirmed isolation and unrelated records", () => {
    const env = { CREW_DEMO_PROJECT_REF: "abcdefghijklmnopqrst", CREW_DEMO_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", CREW_DEMO_ISOLATION: "synthetic-only", PAYPAL_ENVIRONMENT: "sandbox", CREW_DEMO_SERVICE_ROLE_KEY: "server-only-test", CREW_DEMO_PASSWORD: "disposable-test-password" };
    expect(demoTarget(env).generation).toBe("1");
    for (const overrides of [{ CREW_DEMO_PROJECT_REF: "tsnwowlyrlxpwwetmxns" }, { CREW_DEMO_SUPABASE_URL: "https://other.supabase.co" }, { CREW_DEMO_ISOLATION: "" }, { PAYPAL_ENVIRONMENT: "live" }, { CREW_DEMO_GENERATION: "../production" }]) expect(() => demoTarget({ ...env, ...overrides })).toThrow();
    expect(() => assertDemoInventory([{ id: "x", name: "Real business" }], [], [])).toThrow();
    expect(() => assertDemoInventory([], [{ id: "u", app_metadata: {} }], [])).toThrow();
    expect(() => assertDemoInventory([], [{ id: "u", app_metadata: { crew_demo: DEMO_MARKER } }], [{ workspace_id: "real", auth_user_id: "u" }])).toThrow();
    expect(() => assertDemoInventory([], [], [])).not.toThrow();
  });
});
