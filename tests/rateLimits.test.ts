import { describe, expect, it } from "vitest";
import { admission, rateLimits, requestPolicies } from "../shared/rate-limits";
import { responseError, retryQuery } from "../shared/http-errors";
describe("server policies and client retry handling", () => {
  it("validates all overrides with safe defaults and no disabling values", () => {
    expect(rateLimits(() => undefined)).toMatchObject({ api: 120, upload: 10, ai: 10, payment_issue: 5, payment_reconcile: 10, payment_verify: 5 });
    for (const raw of ["", "0", "-1", "10.5", "Infinity", " 10", "10001", "1e2"]) expect(() => rateLimits(() => raw)).toThrow();
    expect(rateLimits(name => name === "RATE_LIMIT_API_PER_MINUTE" ? "240" : undefined).api).toBe(240);
  });
  it("assigns specialized limits to the actual handlers and leaves AI to ai_allow", () => {
    expect(requestPolicies("files/upload", "POST")).toEqual(["api", "upload"]);
    expect(requestPolicies("payments/issue", "POST")).toEqual(["api", "payment_issue"]);
    expect(requestPolicies("payments/reconcile", "POST")).toEqual(["api", "payment_reconcile"]);
    expect(requestPolicies("payments/verify-configuration", "POST")).toEqual(["api", "payment_verify"]);
    for (const path of ["ai/workspace", "ai/brief", "ai/revision", "workspaces/create"]) expect(requestPolicies(path, "POST")).toEqual(["api"]);
    expect(requestPolicies("files/upload", "OPTIONS")).toEqual([]);
  });
  it("fails closed on malformed database admission results", () => {
    for (const value of [null, true, {}, { allowed: false, retryAfter: 0 }, { allowed: false, retryAfter: 61 }, { allowed: true, retryAfter: 5 }]) expect(() => admission(value)).toThrow();
  });
  it("shows a safe retry message without retrying throttled queries or payments", () => {
    const error = responseError(429, "35", { error: { message: "raw-secret-stack" } });
    expect(error.message).toContain("35 seconds");
    expect(error.message).not.toContain("secret");
    expect(retryQuery(0, error)).toBe(false);
    expect(retryQuery(0, responseError(503, "5", {}))).toBe(false);
    expect(retryQuery(0, new Error("transient"))).toBe(true);
    expect(retryQuery(1, new Error("transient"))).toBe(false);
    expect(responseError(429, "<script>", {}).retryAfter).toBeNull();
  });
});
