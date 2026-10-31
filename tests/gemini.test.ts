import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AIProviderError,
  DEFAULT_GEMINI_MODEL,
  generateGemini,
} from "../shared/gemini";
import { aiFailure } from "../shared/ai-errors";
const schema = z.object({
  summary: z.string().min(1),
  projectIds: z.array(z.string()).max(2),
}).strict();
const options = {
  apiKey: "synthetic-provider-key",
  model: DEFAULT_GEMINI_MODEL,
  schema,
  system: "Read-only synthetic test",
  input: { question: "Synthetic", context: { projects: [] } },
  maxOutputTokens: 200,
};
const candidate = (text: string, finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { parts: [{ text }] } }],
});
const response = (data: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers });
describe("Gemini native structured transport and safety", () => {
  it("sends credentials only in headers to the fixed Google host and validates structured data", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(
      response(candidate('{"summary":"Synthetic result","projectIds":[]}')),
    );
    expect(await generateGemini(options, send)).toEqual({
      summary: "Synthetic result",
      projectIds: [],
    });
    const [url, request] = send.mock.calls[0];
    expect(url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`,
    );
    expect(String(url)).not.toContain(options.apiKey);
    expect(request?.redirect).toBe("error");
    expect((request?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      options.apiKey,
    );
    const body = JSON.parse(String(request?.body));
    expect(body.systemInstruction.parts[0].text).toBe(options.system);
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual(options.input);
    expect(body.generationConfig.responseFormat.text.mimeType).toBe(
      "APPLICATION_JSON",
    );
    expect(
      body.generationConfig.responseFormat.text.schema.additionalProperties,
    ).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(request?.body).not.toContain(options.apiKey);
  });
  it.each([
    "https://attacker.example/model",
    "gemini-model/../private",
    "gemini-model?key=secret",
  ])(
    "rejects an invalid model path before transmitting data",
    async (model) => {
      const send = vi.fn<typeof fetch>();
      await expect(generateGemini({ ...options, model }, send)).rejects
        .toMatchObject({ code: "AI_REQUEST_CONFIG" });
      expect(send).not.toHaveBeenCalled();
    },
  );
  it("keeps full local bounds enforced when provider schema hints omit decoder-heavy bounds", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(
      response(candidate('{"summary":"x","projectIds":["a","b","c"]}')),
    );
    await expect(generateGemini(options, send)).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
    const sent = JSON.parse(String(send.mock.calls[0][1]?.body));
    expect(
      sent.generationConfig.responseFormat.text.schema.properties.projectIds
        .maxItems,
    ).toBeUndefined();
    expect(sent.generationConfig.responseFormat.text.schema.required).toEqual([
      "summary",
      "projectIds",
    ]);
  });
  it.each([
    { status: 400, details: [{ reason: "API_KEY_INVALID" }], code: "AI_AUTH" },
    { status: 401, code: "AI_AUTH" },
    { status: 403, code: "AI_AUTH" },
    { status: 404, code: "AI_MODEL_ACCESS" },
    { status: 429, code: "AI_PROVIDER_RATE_LIMIT" },
    { status: 400, code: "AI_REQUEST_CONFIG" },
    { status: 500, code: "AI_UNAVAILABLE" },
  ])(
    "sanitizes provider failure $status / $code without retry or fallback",
    async ({ status, details, code }) => {
      const send = vi.fn<typeof fetch>().mockResolvedValue(
        response(
          { error: { message: "synthetic-secret-value", details } },
          status,
          { "retry-after": "60" },
        ),
      );
      try {
        await generateGemini(options, send);
        expect.fail("must reject");
      } catch (error) {
        expect(error).toBeInstanceOf(AIProviderError);
        expect(aiFailure(error).code).toBe(code);
        expect(JSON.stringify(aiFailure(error))).not.toContain(
          "synthetic-secret-value",
        );
      }
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    candidate("not JSON"),
    candidate('{"summary":"x","projectIds":[],"unexpected":true}'),
    candidate('{"summary":"x","projectIds":[]}', "MAX_TOKENS"),
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [] },
    {
      candidates: [{
        finishReason: "STOP",
        content: { parts: [{ functionCall: { name: "pay" } }] },
      }],
    },
  ])("rejects malformed, blocked, truncated or tool output", async (data) => {
    await expect(
      generateGemini(
        options,
        vi.fn<typeof fetch>().mockResolvedValue(response(data)),
      ),
    ).rejects.toMatchObject({ code: "AI_UNAVAILABLE" });
  });
  it("discards thought text and parses only the final structured answer", async () => {
    const data = {
      candidates: [{
        finishReason: "STOP",
        content: {
          parts: [{ thought: true, text: "internal synthetic reasoning" }, {
            text: '{"summary":"Final","projectIds":[]}',
          }],
        },
      }],
    };
    expect(
      await generateGemini(
        options,
        vi.fn<typeof fetch>().mockResolvedValue(response(data)),
      ),
    ).toEqual({ summary: "Final", projectIds: [] });
  });
  it("maps timeouts without leaking transport errors", async () => {
    const send = vi.fn<typeof fetch>().mockRejectedValue(
      new DOMException("secret request details", "TimeoutError"),
    );
    await expect(generateGemini(options, send)).rejects.toMatchObject({
      status: 504,
      code: "AI_TIMEOUT",
    });
  });
});
