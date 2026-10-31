// Do not echo SDK error messages: authentication errors can contain key fragments.
export function aiFailure(error: unknown) {
  const value = error && typeof error === "object"
    ? error as {
      status?: number;
      code?: string;
      message?: string;
      error?: { code?: string };
      headers?: { get: (name: string) => string | null };
    }
    : {};
  if (
    [value.code, value.error?.code].some((code) =>
      code &&
      [
        "insufficient_quota",
        "credit_balance_exhausted",
        "billing_hard_limit_reached",
        "quota_exceeded",
      ]
        .includes(code)
    )
  ) {
    return {
      status: 503,
      code: "AI_QUOTA",
      message:
        "The AI provider reports insufficient API quota. Check the provider billing and project limits.",
    };
  }
  if (value.status === 401) {
    return {
      status: 503,
      code: "AI_AUTH",
      message:
        "The AI provider rejected the server API credentials. Check the configured API key.",
    };
  }
  if (value.status === 403 || value.status === 404) {
    return {
      status: 503,
      code: "AI_MODEL_ACCESS",
      message:
        "The configured AI model is not available to this API project. Check model access and OPENAI_MODEL.",
    };
  }
  if (value.status === 429) {
    const limit = value.message?.match(/\bLimit[:\s]+([0-9,]+)/i)?.[1];
    const requested = value.message?.match(/\bRequested[:\s]+([0-9,]+)/i)?.[1];
    const retry = value.headers?.get?.("retry-after");
    const details = limit && requested
      ? ` Token limit ${limit}; requested ${requested}.`
      : "";
    const wait = retry && /^\d{1,6}$/.test(retry)
      ? ` Retry after at least ${retry} seconds.`
      : "";
    return {
      status: 429,
      code: "AI_PROVIDER_RATE_LIMIT",
      message: "The AI provider rate limit was reached." + details + wait +
        " Check the API project's model limits before retrying.",
    };
  }
  if (value.status === 400) {
    return {
      status: 502,
      code: "AI_REQUEST_CONFIG",
      message:
        "The AI provider rejected the request format or model configuration. Server configuration needs review.",
    };
  }
  return {
    status: 502,
    code: "AI_UNAVAILABLE",
    message:
      "AI is unavailable or returned an invalid result. Retry or continue with manual review.",
  };
}
