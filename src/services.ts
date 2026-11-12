import { createClient } from "@supabase/supabase-js";
import { responseError } from "../shared/http-errors";
import type { BriefSuggestion,CanvasLayout,ScopeAnalysis,WorkspaceSnapshot } from "../shared/types";
import { type Command,commandSchema,invitationSchema,layoutSchema } from "../shared/validation";
import { clearExpiredAuth } from "./authSession";

// Every account uses the same authenticated services. URL flags never change this.
export const mode: string = "integrated";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export async function signOutSession() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error?.name === "AuthSessionMissingError") {
    // A revoked harness/session can leave a cached user after the SDK no longer
    // has a session to revoke. Clear only this project's stale local credentials.
    clearExpiredAuth(localStorage, url);
    window.location.reload();
  } else if (error) throw error;
}
export async function signupAvailable(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const settings = await response.json();
    return settings.disable_signup === false;
  } catch {
    return false;
  }
}
let activeWorkspaceId: string | null = null;
export function setActiveWorkspace(id: string | null) {
  activeWorkspaceId = id;
}
export function workspaceHeaders(): Record<string, string> {
  return activeWorkspaceId ? { "X-Workspace-Id": activeWorkspaceId } : {};
}
export interface CrewRepository {
  load(): Promise<WorkspaceSnapshot>;
  command(command: Command, requestId: string): Promise<void>;
  saveLayout(layout: CanvasLayout): Promise<CanvasLayout>;
}
export interface ScopeAssistant {
  extract(brief: string): Promise<BriefSuggestion>;
  compare(projectId: string, text: string): Promise<ScopeAnalysis>;
}
export interface PaymentGateway {
  issue(projectId: string, requestId: string): Promise<void>;
  reconcile(projectId: string): Promise<void>;
}
export async function api(path: string, body?: unknown, requestId?: string) {
  const selectedWorkspaceHeaders = workspaceHeaders();
  if (!supabase) {
    throw new Error(
      "Cannot connect to CrewCanvas. Set the Supabase URL and publishable key, then restart the app.",
    );
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to continue.");
  let response: Response;
  try { response = await fetch(`${url}/functions/v1/crew-api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: key,
      "Content-Type": "application/json",
      ...selectedWorkspaceHeaders,
      ...(requestId ? { "Idempotency-Key": requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  } catch {
    throw new Error("Could not reach CrewCanvas. Check your connection and try again.");
  }
  let result;
  try { result = await response.json(); }
  catch { throw new Error("CrewCanvas returned an unreadable response. Try again."); }
  if (!response.ok) {
    throw responseError(
      response.status,
      response.headers.get("Retry-After"),
      result,
    );
  }
  return result;
}
export const repository: CrewRepository = {
  async load() { return api("snapshot"); },
  async command(command, requestId) {
    if (["simulateInvoice", "simulatePayment"].includes(command.type)) {
      throw new Error("Payment status must be verified with PayPal.");
    }
    await api("command", commandSchema.parse(command), requestId);
  },
  async saveLayout(layout) { return api("layout", layoutSchema.parse(layout)); },
};
export const scopeAssistant: ScopeAssistant = {
  async extract(brief) { return api("ai/brief", { brief }); },
  async compare(projectId, text) { return api("ai/revision", { projectId, text }); },
};
export const payments: PaymentGateway = {
  async issue(projectId, requestId) { await api("payments/issue", { projectId }, requestId); },
  async reconcile(projectId) { await api("payments/reconcile", { projectId }); },
};
export async function inviteMember(email: string, name: string, role: string) {
  return api("invite", invitationSchema.parse({ email, name, role }));
}
