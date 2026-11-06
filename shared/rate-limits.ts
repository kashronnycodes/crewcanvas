export const RATE_POLICIES = {
  api: { default: 120, max: 10000 },
  payment_issue: { default: 5, max: 100 },
  payment_reconcile: { default: 10, max: 100 },
  payment_verify: { default: 5, max: 100 },
  upload: { default: 10, max: 100 },
  ai: { default: 10, max: 100 },
  payment_issue_project: { default: 2, max: 20 },
  payment_reconcile_project: { default: 5, max: 30 },
} as const;
export type RatePolicy = keyof typeof RATE_POLICIES;
export function rateLimits(get: (name: string) => string | undefined): Record<RatePolicy, number> {
  return Object.fromEntries(Object.entries(RATE_POLICIES).map(([name, policy]) => {
    const raw = get(`RATE_LIMIT_${name.toUpperCase()}_PER_MINUTE`);
    if (raw === undefined) return [name, policy.default];
    if (!/^[1-9][0-9]{0,4}$/.test(raw) || Number(raw) > policy.max) throw new Error("Invalid server rate-limit configuration.");
    return [name, Number(raw)];
  })) as Record<RatePolicy, number>;
}
export function requestPolicies(path: string, method: string): RatePolicy[] {
  if (method === "OPTIONS") return [];
  if (method === "POST") {
    const specific: Record<string, RatePolicy> = {
      "payments/issue": "payment_issue", "payments/reconcile": "payment_reconcile",
      "payments/verify-configuration": "payment_verify", "files/upload": "upload",
    };
    if (specific[path]) return ["api", specific[path]];
  }
  // AI admission stays in ai_allow, shared by every AI entry point.
  return ["api"];
}
export function admission(value: unknown): { allowed: boolean; retryAfter: number } {
  if (!value || typeof value !== "object") throw new Error("Invalid rate-limit response.");
  const { allowed, retryAfter } = value as Record<string, unknown>;
  if (typeof allowed !== "boolean" || !Number.isInteger(retryAfter) ||
    (allowed ? retryAfter !== 0 : Number(retryAfter) < 1 || Number(retryAfter) > 60)) {
    throw new Error("Invalid rate-limit response.");
  }
  return { allowed, retryAfter: Number(retryAfter) };
}
