import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDS, seedWorkspace } from "../shared/seed";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
 vi.resetModules();
 vi.stubEnv("VITE_APP_MODE", "demo");
 vi.stubEnv("VITE_SUPABASE_URL", "https://configured.supabase.co");
 vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
 window.history.replaceState({}, "", "/?demo=1&account=employer");
 localStorage.setItem("crewcanvas.public-demo.v1", "retained old records");
 mocks.getSession.mockResolvedValue({ data: { session: { access_token: "account-token" } } });
 mocks.createClient.mockReturnValue({ auth: { getSession: mocks.getSession } });
 fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
 vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
it("always loads real records even with legacy demo flags and local data", async () => {
 const { repository, setActiveWorkspace, mode } = await import("../src/services");
 const seed = seedWorkspace(); fetcher.mockResolvedValue(new Response(JSON.stringify(seed)));
 setActiveWorkspace(IDS.workspace);
 expect(mode).toBe("integrated"); expect(await repository.load()).toEqual(seed);
 expect(fetcher).toHaveBeenCalledWith("https://configured.supabase.co/functions/v1/crew-api/snapshot", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer account-token", "X-Workspace-Id": IDS.workspace }) }));
 expect(localStorage.getItem("crewcanvas.public-demo.v1")).toBe("retained old records");
});
it("requires authentication instead of opening a local workspace", async () => {
 mocks.getSession.mockResolvedValue({ data: { session: null } });
 const { repository } = await import("../src/services");
 await expect(repository.load()).rejects.toThrow("Sign in"); expect(fetcher).not.toHaveBeenCalled();
});
it("shows a connection error when credentials are missing", async () => {
 vi.stubEnv("VITE_SUPABASE_URL", "");
 const { repository } = await import("../src/services");
 await expect(repository.load()).rejects.toThrow("Cannot connect"); expect(fetcher).not.toHaveBeenCalled();
});
it("calls the configured AI and reports provider errors without canned answers", async () => {
 const { scopeAssistant } = await import("../src/services");
 fetcher.mockResolvedValue(new Response(JSON.stringify({ error: { message: "AI is unavailable. Try again." } }), { status: 503 }));
 await expect(scopeAssistant.extract("Write a launch brief")).rejects.toThrow("AI is unavailable");
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/ai/brief"), expect.objectContaining({ body: JSON.stringify({ brief: "Write a launch brief" }) }));
});
it("uses verified payment endpoints and refuses simulated payment commands", async () => {
 const { payments, repository } = await import("../src/services");
 await payments.issue(seedWorkspace().projects[0].id, "request-one"); await payments.reconcile(seedWorkspace().projects[0].id);
 expect(fetcher.mock.calls.map(call => call[0])).toEqual(["https://configured.supabase.co/functions/v1/crew-api/payments/issue", "https://configured.supabase.co/functions/v1/crew-api/payments/reconcile"]);
 // @ts-expect-error Legacy simulation commands are rejected at the boundary.
 await expect(repository.command({ type: "simulateInvoice", projectId: seedWorkspace().projects[0].id }, crypto.randomUUID())).rejects.toThrow("verified with PayPal");
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it("persists file changes through the authenticated API", async () => {
 const { files } = await import("../src/fileService");
 await files.url(crypto.randomUUID());
 expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("/files/url"), expect.objectContaining({ method: "POST" }));
});

it("gives useful connection errors without substituting saved browser records", async () => {
 fetcher.mockRejectedValue(new TypeError("Failed to fetch"));
 const { repository }=await import("../src/services");
 await expect(repository.load()).rejects.toThrow("Check your connection");
});
