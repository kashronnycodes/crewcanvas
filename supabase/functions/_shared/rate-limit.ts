import { admission, rateLimits, requestPolicies, type RatePolicy } from "../../../shared/rate-limits.ts";
import { admin, HttpError, providerStore } from "./backend.ts";

function limits() {
  try { return rateLimits((name) => Deno.env.get(name)); }
  catch { throw unavailable(); }
}
const unavailable = () => new HttpError(503, "RATE_LIMIT_UNAVAILABLE", "Request protection is temporarily unavailable. Please try again shortly.", 5);
function enforce(value: unknown) {
  let result;
  try { result = admission(value); } catch { throw unavailable(); }
  if (!result.allowed) throw new HttpError(429, "RATE_LIMIT_EXCEEDED", "Too many requests. Please try again shortly.", result.retryAfter);
}
export async function enforceRateLimit(identity: string, policies: RatePolicy[], scope?: string) {
  if (!policies.length) return;
  const configured = limits();
  let result;
  try {
    result = await admin().rpc("api_rate_limit", {
      p_identity: identity, p_policies: policies, p_limits: configured,
      ...(scope ? { p_scope: scope } : {}),
    });
  } catch { throw unavailable(); }
  if (result.error?.code === "42501") throw new HttpError(403, "FORBIDDEN", "This project is not available to your account.");
  if (result.error) throw unavailable();
  enforce(result.data);
}
export function enforceRequestLimit(identity: string, path: string, method: string) {
  return enforceRateLimit(identity, requestPolicies(path, method));
}
export async function enforceAiLimit(actorId: string) {
  const configured = limits();
  let result;
  try {
    // ai_allow resolves the immutable membership -> Auth identity in PostgreSQL.
    // A workspace question with two provider calls consumes one admission.
    result = await providerStore("ai_allow", { actorId, limit: configured.ai, details: true });
  } catch { throw unavailable(); }
  enforce(result);
}
