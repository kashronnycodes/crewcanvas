// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seedWorkspace } from "../shared/seed";
const m = vi.hoisted(() => ({
  rpc: vi.fn(), getUser: vi.fn(), serve: vi.fn(), upload: vi.fn(), issue: vi.fn(), reconcile: vi.fn(), verify: vi.fn(),
  generate: vi.fn(), env: {} as Record<string, string>, authId: "60000000-0000-4000-8000-000000000001",
  role: "employer", actor: "20000000-0000-4000-8000-000000000001", workspace: "10000000-0000-4000-8000-000000000001",
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({
  auth: { getUser: m.getUser }, rpc: m.rpc,
  from: () => {
    const builder = { select: () => builder, eq: () => builder,
      single: async () => ({ data: { id: m.actor, access_role: m.role, workspace_id: m.workspace }, error: null }) };
    return builder;
  },
}) }));
vi.mock("../supabase/functions/_shared/onboarding.ts", () => ({
  onboarding: async (_req: Request, path: string) => path === "workspaces" ? Response.json({ ok: true }) : null,
  checked: (r: { data: unknown }) => r.data, tokenHash: vi.fn(),
}));
vi.mock("../supabase/functions/_shared/paypal.ts", () => ({ issueInvoice: m.issue, reconcileProject: m.reconcile, verifySandboxCredentials: m.verify }));
vi.mock("../supabase/functions/_shared/files.ts", () => ({ uploadFile: m.upload, authorizedFile: vi.fn(), fileUrl: vi.fn(), updateFile: vi.fn() }));
vi.mock("../supabase/functions/_shared/ai-provider.ts", () => ({ aiConfig: () => ({ model: "test" }), generateStructured: m.generate }));
vi.stubGlobal("Deno", { env: { get: (key: string) => m.env[key] }, serve: m.serve });
// Variable imports keep Deno entrypoints out of the browser TypeScript project.
const entry = "../supabase/functions/crew-api/index.ts";
const { handler } = await import(entry);
const rateEntry = "../supabase/functions/_shared/rate-limit.ts";
const { enforceAiLimit } = await import(rateEntry);
const workspaceEntry = "../supabase/functions/_shared/workspace-ai.ts";
const { workspaceCommand } = await import(workspaceEntry);
const backendEntry = "../supabase/functions/_shared/backend.ts";
const backend = await import(backendEntry);
function request(path: string, body: unknown = {}, options: { method?: string; authenticated?: boolean } = {}) {
  return new Request(`https://example.test/functions/v1/crew-api/${path}`, {
    method: options.method ?? "POST", headers: {
      Origin: "https://crewcanvas.test", "Content-Type": "application/json",
      "Idempotency-Key": "70000000-0000-4000-8000-000000000001",
      ...(options.authenticated === false ? {} : { Authorization: "Bearer verified-token" }),
    }, body: options.method === "GET" || options.method === "OPTIONS" ? undefined : JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.env = { ALLOWED_ORIGIN: "https://crewcanvas.test", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "server-key-not-for-responses" };
  m.role = "employer";
  m.getUser.mockResolvedValue({ data: { user: { id: m.authId, email: "synthetic@example.com" } }, error: null });
  m.rpc.mockResolvedValue({ data: { allowed: true, retryAfter: 0 }, error: null });
  m.upload.mockResolvedValue({ ok: true }); m.issue.mockResolvedValue({ invoiceId: "synthetic" });
  m.reconcile.mockResolvedValue(undefined); m.verify.mockResolvedValue({ environment: "sandbox" });
});
afterEach(() => vi.restoreAllMocks());
describe("actual Edge handler admission and provider ordering", () => {
  it("ordinary authenticated requests pass using server-verified Auth identity", async () => {
    expect((await handler(request("workspaces", undefined, { method: "GET" }))).status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith("api_rate_limit", expect.objectContaining({ p_identity: m.authId, p_policies: ["api"] }));
  });
  it("preflight bypasses counters and anonymous callers remain unauthorized", async () => {
    const preflight = await handler(request("payments/issue", undefined, { method: "OPTIONS" }));
    expect(preflight.status).toBe(200);
    expect(m.getUser).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
    expect((await handler(request("payments/issue", {}, { authenticated: false }))).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("permits one exact release-preview origin while retaining existing origin settings", async () => {
    m.env.ALLOWED_RELEASE_ORIGIN = "https://crewcanvas-release.example";
    for (const origin of ["https://crewcanvas.test", "https://crewcanvas-release.example", "https://untrusted.example"]) {
      const req = request("snapshot", undefined, { method: "OPTIONS" });
      req.headers.set("Origin", origin);
      const response = await handler(req);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin === "https://untrusted.example" ? null : origin);
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each(["payments/issue", "payments/reconcile", "payments/verify-configuration", "files/upload", "ai/brief", "ai/workspace"])("rejects %s before any provider, upload or AI call", async path => {
    m.rpc.mockResolvedValue({ data: { allowed: false, retryAfter: 23 }, error: null });
    const result = await handler(request(path, { projectId: "50000000-0000-4000-8000-000000000001" }));
    expect(result.status).toBe(429); expect(result.headers.get("Retry-After")).toBe("23");
    expect(result.headers.get("Access-Control-Expose-Headers")).toContain("Retry-After");
    expect(await result.json()).toMatchObject({ ok: false, code: "RATE_LIMIT_EXCEEDED", error: { code: "RATE_LIMIT_EXCEEDED" } });
    for (const provider of [m.issue, m.reconcile, m.verify, m.upload, m.generate]) expect(provider).not.toHaveBeenCalled();
  });
  it("rate-limit storage/configuration failure fails closed and sanitizes errors", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "postgres-password-super-secret" } });
    const result = await handler(request("payments/issue"));
    expect(result.status).toBe(503); expect(await result.text()).not.toContain("super-secret");
    expect(m.issue).not.toHaveBeenCalled();
    m.env.RATE_LIMIT_PAYMENT_ISSUE_PER_MINUTE = "0";
    expect((await handler(request("files/upload"))).status).toBe(503);
    expect(m.upload).not.toHaveBeenCalled();
  });
  it("applies the project quota before invoice mutation and preserves the idempotency key on allowed requests", async () => {
    m.rpc.mockResolvedValueOnce({ data: { allowed: true, retryAfter: 0 }, error: null })
      .mockResolvedValueOnce({ data: { allowed: false, retryAfter: 10 }, error: null });
    const projectId = "50000000-0000-4000-8000-000000000001";
    expect((await handler(request("payments/issue", { projectId }))).status).toBe(429);
    expect(m.issue).not.toHaveBeenCalled();
    expect(m.rpc).toHaveBeenLastCalledWith("api_rate_limit", expect.objectContaining({ p_policies: ["payment_issue_project"], p_scope: projectId }));
    expect((await handler(request("payments/issue", { projectId }))).status).toBe(200);
    expect(m.issue).toHaveBeenCalledWith(projectId, expect.objectContaining({ authUserId: m.authId }), "70000000-0000-4000-8000-000000000001");
  });
  it("allows authorized uploads and refuses exhausted AI admission without double counters", async () => {
    expect((await handler(request("files/upload"))).status).toBe(200); expect(m.upload).toHaveBeenCalledOnce();
    m.rpc.mockClear();
    m.rpc.mockResolvedValue({ data: { allowed: false, retryAfter: 15 }, error: null })
      .mockResolvedValueOnce({ data: { allowed: true, retryAfter: 0 }, error: null });
    const result = await handler(request("ai/brief", { brief: "A synthetic launch campaign brief." }));
    expect(result.status).toBe(429); expect(m.generate).not.toHaveBeenCalled();
    // Test the actual leaf limiter through the actual provider_store path.
    await expect(enforceAiLimit(m.actor)).rejects.toMatchObject({ status: 429, retryAfter: 15 });
    expect(m.rpc).toHaveBeenLastCalledWith("provider_store", { p_action: "ai_allow", p_payload: { actorId: m.actor, limit: 10, details: true } });
    await expect(workspaceCommand({ text: "Summarize my project" }, { id: m.actor, role: "employer", workspaceId: m.workspace })).rejects.toMatchObject({ status: 429 });
    expect(m.generate).not.toHaveBeenCalled();
  });
  it("a workspace summary with two Gemini calls uses one shared AI admission and retains the audit record", async () => {
    vi.spyOn(backend, "snapshot").mockResolvedValue(seedWorkspace());
    m.generate.mockResolvedValueOnce({ intent: "summary" }).mockResolvedValueOnce({ summary: "Synthetic project progress.", projectIds: [] });
    const result = await handler(request("ai/workspace", { text: "Summarize my project" }));
    expect(result.status).toBe(200);
    expect(m.generate).toHaveBeenCalledTimes(2);
    expect(m.rpc.mock.calls.filter(c => c[0] === "provider_store" && c[1].p_action === "ai_allow")).toHaveLength(1);
    expect(m.rpc.mock.calls.filter(c => c[0] === "provider_store" && c[1].p_action === "ai_run")).toHaveLength(1);
  });
  it("an allowed brief consumes one AI admission; provider 429 stays sanitized with retry information", async () => {
    const providerError = Object.assign(new Error("sk-provider-secret"), { status: 429, headers: new Headers({ "Retry-After": "42" }) });
    m.generate.mockRejectedValue(providerError);
    const result = await handler(request("ai/brief", { brief: "A synthetic launch campaign brief." }));
    expect(result.status).toBe(429); expect(result.headers.get("Retry-After")).toBe("42");
    expect(await result.text()).not.toContain("sk-provider-secret");
    expect(m.rpc.mock.calls.filter(c => c[0] === "provider_store" && c[1].p_action === "ai_allow")).toHaveLength(1);
  });
  it("revision analysis shares the AI admission after project authorization", async () => {
    const project = seedWorkspace().projects[0];
    const authorize = vi.spyOn(backend, "authorizedProject").mockResolvedValue(project);
    m.rpc.mockResolvedValueOnce({ data: { allowed: true, retryAfter: 0 }, error: null })
      .mockResolvedValueOnce({ data: { allowed: false, retryAfter: 12 }, error: null });
    const result = await handler(request("ai/revision", { projectId: project.id, text: "Add another concept" }));
    expect(result.status).toBe(429);
    expect(authorize).toHaveBeenCalledWith(project.id, expect.objectContaining({ authUserId: m.authId }));
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.rpc.mock.calls.filter(c => c[0] === "provider_store" && c[1].p_action === "ai_allow")).toHaveLength(1);
  });
});

describe("manual member API authorization", () => {
  const member = {name:"Taylor Brooks",email:"taylor@example.com",role:"Producer"};
  it("only creates a member after a valid authenticated owner submission", async () => {
    expect((await handler(request("members/create", member))).status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith("add_workspace_member", {
      p_actor_id:m.actor,p_id:"70000000-0000-4000-8000-000000000001",p_name:member.name,p_email:member.email,p_role:member.role,
    });
  });
  it.each(["members/create", "members/update"])("denies worker writes to %s", async path => {
    m.role="worker";
    expect((await handler(request(path, member))).status).toBe(403);
    expect(m.rpc.mock.calls.some(call=>call[0]==="add_workspace_member")).toBe(false);
  });
  it.each([{...member,name:"  "},{...member,role:" "},{...member,email:"invalid"},{...member,accessRole:"employer"}])("rejects invalid or privileged fields before writing", async value => {
    expect((await handler(request("members/create", value))).status).toBe(400);
    expect(m.rpc.mock.calls.some(call=>call[0]==="add_workspace_member")).toBe(false);
  });
  it("denies anonymous creation", async () => {
    expect((await handler(request("members/create",member,{authenticated:false}))).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("unassigned task API", () => {
  function commandAdmission() {
    m.rpc.mockImplementation(async (name, args) => ({data:name==="provider_store" && args.p_action==="command_result" ? null : {allowed:true,retryAfter:0},error:null}));
  }
  it("creates an explicit unassigned planning task through the actual handler", async () => {
    commandAdmission();
    const commit = vi.spyOn(backend,"commit").mockResolvedValue({ok:true});
    const {brief,deliverables,amountMinor,currency,deadline,revisionRounds,paymentDays}=seedWorkspace().projects[0].agreements[0];
    const response=await handler(request("command",{type:"createProject",title:"Plan before hiring",workerId:null,terms:{brief,deliverables,amountMinor,currency,deadline,revisionRounds,paymentDays}}));
    expect(response.status).toBe(200);
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({workerId:null,agreements:[expect.objectContaining({status:"draft"})]}),expect.anything(),-1,expect.any(String));
  });
  it("clears a planning assignment through the owner-only handler", async () => {
    commandAdmission();
    const p={...seedWorkspace().projects[0],activeAgreementId:null,agreements:[],deliveries:[],invoices:[],revisions:[],proposals:[]};
    vi.spyOn(backend,"authorizedProject").mockResolvedValue(p);
    const commit=vi.spyOn(backend,"commit").mockResolvedValue({ok:true});
    expect((await handler(request("command",{type:"assignTask",projectId:p.id,workerId:null}))).status).toBe(200);
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({workerId:null}),expect.anything(),p.version,expect.any(String));
    m.role="worker";
    expect((await handler(request("command",{type:"assignTask",projectId:p.id,workerId:null}))).status).toBe(403);
  });
});

it("denies regular member calls to the retired peer task-list endpoint",async()=>{
 m.role="worker";
 const response=await handler(request("roster/summaries",undefined,{method:"GET"}));
 expect(response.status).toBe(403);expect(await response.text()).not.toContain("tasks");
});
