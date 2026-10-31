import { describe, expect, it } from "vitest";
import { aiFailure } from "../shared/ai-errors";
describe("safe AI provider diagnostics", () => {
  it.each([
    { status: 401, expected: "AI_AUTH" },
    { status: 403, expected: "AI_MODEL_ACCESS" },
    { status: 404, expected: "AI_MODEL_ACCESS" },
    { status: 429, expected: "AI_PROVIDER_RATE_LIMIT" },
    { status: 400, expected: "AI_REQUEST_CONFIG" },
  ])(
    "classifies status $status without disclosing provider error content",
    ({ status, expected }) => {
      const result = aiFailure({
        status,
        message: "API key sk-secret-test-fragment",
        request: { headers: { Authorization: "secret" } },
      });
      expect(result.code).toBe(expected);
      expect(JSON.stringify(result)).not.toContain("sk-secret");
      expect(JSON.stringify(result)).not.toContain("Authorization");
    },
  );
  it("distinguishes exhausted quota from a transient rate limit", () => {
    expect(aiFailure({ status: 429, code: "credit_balance_exhausted" }).code)
      .toBe("AI_QUOTA");
    expect(aiFailure({ status: 429, code: "insufficient_quota" }).code).toBe(
      "AI_QUOTA",
    );
  });
  it("reports only allowlisted numeric rate-limit diagnostics", () => {
    const result = aiFailure({
      status: 429,
      message: "org-private: sk-secret Limit: 1,000 Requested: 6,000",
      headers: { get: () => "60" },
    });
    expect(result.message).toContain("Token limit 1,000; requested 6,000");
    expect(result.message).toContain("60 seconds");
    expect(result.message).not.toContain("sk-secret");
    expect(result.message).not.toContain("org-private");
  });
});
