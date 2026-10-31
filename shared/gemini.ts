import { z } from "zod";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
export class AIProviderError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "AIProviderError";
  }
}
type Options<T> = {
  apiKey: string;
  model: string;
  schema: z.ZodType<T>;
  system: string;
  input: unknown;
  maxOutputTokens: number;
  timeoutMs?: number;
};

export function geminiSchema(schema: z.ZodType) {
  const source = z.toJSONSchema(schema, { target: "draft-7" });
  const simplify = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(simplify);
    if (value && typeof value === "object") {
      // Nested large bounds can make Gemini's constrained decoder reject an
      // otherwise valid schema. Keep structural/type/enum constraints in the
      // provider hint; the original full Zod schema still validates every result.
      return Object.fromEntries(
        Object.entries(value).filter(([key]) =>
          !["$schema", "minLength", "maxLength", "minItems", "maxItems"]
            .includes(key)
        ).map(([key, child]) => [key, simplify(child)]),
      );
    }
    return value;
  };
  return simplify(source);
}

// A single bounded request. No tools, external retrieval, automatic provider
// fallback or retries that could amplify free-tier quota/cost consumption.
export async function generateGemini<T>(
  options: Options<T>,
  send: typeof fetch = fetch,
): Promise<T> {
  if (!/^gemini-[a-z0-9.-]{1,90}$/.test(options.model)) {
    throw new AIProviderError(
      503,
      "AI_REQUEST_CONFIG",
      "Check the server GEMINI_MODEL setting.",
    );
  }
  if (!options.apiKey.trim()) {
    throw new AIProviderError(
      503,
      "AI_AUTH",
      "Configure GEMINI_API_KEY in the server secrets.",
    );
  }
  const schema = geminiSchema(options.schema);
  let response: Response;
  let result: any;
  try {
    response = await send(
      `https://generativelanguage.googleapis.com/v1beta/models/${
        encodeURIComponent(options.model)
      }:generateContent`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": options.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: options.system }] },
          contents: [{
            role: "user",
            parts: [{ text: JSON.stringify(options.input) }],
          }],
          generationConfig: {
            maxOutputTokens: options.maxOutputTokens,
            responseFormat: { text: { mimeType: "APPLICATION_JSON", schema } },
          },
        }),
      },
    );
    result = await response.json();
  } catch (error) {
    if (
      error && typeof error === "object" && "name" in error &&
      ["AbortError", "TimeoutError"].includes(String(error.name))
    ) {
      throw new AIProviderError(
        504,
        "AI_TIMEOUT",
        "The AI request timed out. Retry or continue with manual review.",
      );
    }
    throw new AIProviderError(
      502,
      "AI_UNAVAILABLE",
      "Gemini is unavailable or returned an invalid response. Retry or continue with manual review.",
    );
  }
  if (!response.ok) {
    // Inspect only structured error reasons; never echo vendor messages, URLs,
    // API-key fragments, request headers or raw response data to the browser.
    const reasons =
      (Array.isArray(result?.error?.details) ? result.error.details : [])
        .map((detail: { reason?: unknown }) => detail?.reason);
    if (
      [401, 403].includes(response.status) ||
      reasons.some((reason: unknown) =>
        ["API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_SERVICE_BLOCKED"]
          .includes(String(reason))
      )
    ) {
      throw new AIProviderError(
        503,
        "AI_AUTH",
        "Gemini rejected the server credentials or API permissions. Check GEMINI_API_KEY and its API restrictions.",
      );
    }
    if (response.status === 404) {
      throw new AIProviderError(
        503,
        "AI_MODEL_ACCESS",
        "The configured Gemini model is unavailable. Check GEMINI_MODEL and project access.",
      );
    }
    if (response.status === 429) {
      const retry = response.headers.get("retry-after");
      const wait = retry && /^\d{1,6}$/.test(retry)
        ? ` Retry after at least ${retry} seconds.`
        : "";
      throw new AIProviderError(
        429,
        "AI_PROVIDER_RATE_LIMIT",
        "Gemini quota or rate limit was reached. Check this API project's limits in Google AI Studio." +
          wait,
      );
    }
    if (response.status === 400) {
      throw new AIProviderError(
        502,
        "AI_REQUEST_CONFIG",
        "Gemini rejected the request configuration. Check server model and structured-output settings.",
      );
    }
    throw new AIProviderError(
      502,
      "AI_UNAVAILABLE",
      "Gemini is temporarily unavailable. Retry or continue with manual review.",
    );
  }
  const candidate = result?.candidates?.[0];
  if (
    result?.promptFeedback?.blockReason || candidate?.finishReason !== "STOP"
  ) {
    throw new AIProviderError(
      502,
      "AI_UNAVAILABLE",
      "Gemini could not complete this analysis. Rephrase the request or continue with manual review.",
    );
  }
  const parts = candidate?.content?.parts;
  if (
    !Array.isArray(parts) ||
    parts.some((part) =>
      part.functionCall || part.executableCode || part.codeExecutionResult
    )
  ) {
    throw new AIProviderError(
      502,
      "AI_UNAVAILABLE",
      "Gemini returned an unexpected response. Continue with manual review.",
    );
  }
  const text = parts.filter((part) =>
    !part.thought && typeof part.text === "string"
  ).map((part) => part.text).join("");
  try {
    return options.schema.parse(JSON.parse(text));
  } catch {
    throw new AIProviderError(
      502,
      "AI_UNAVAILABLE",
      "Gemini returned an invalid analysis. Retry or continue with manual review.",
    );
  }
}
