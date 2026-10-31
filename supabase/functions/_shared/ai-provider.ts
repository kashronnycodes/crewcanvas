import OpenAI from "npm:openai@6.15.0";
import { zodTextFormat } from "npm:openai@6.15.0/helpers/zod";
import { z } from "zod";
import {
  DEFAULT_GEMINI_MODEL,
  generateGemini,
} from "../../../shared/gemini.ts";
import { env, HttpError } from "./backend.ts";

export function aiConfig() {
  const provider = Deno.env.get("AI_PROVIDER") ?? "gemini";
  if (provider !== "gemini" && provider !== "openai") {
    throw new HttpError(
      503,
      "AI_REQUEST_CONFIG",
      "Set AI_PROVIDER to gemini or openai in server configuration.",
    );
  }
  return {
    provider,
    model: provider === "gemini"
      ? Deno.env.get("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL
      : Deno.env.get("OPENAI_MODEL") ?? "gpt-6-astra",
  };
}

export async function generateStructured<T>(options: {
  schema: z.ZodType<T>;
  schemaName: string;
  system: string;
  input: unknown;
  maxOutputTokens: number;
  timeoutMs?: number;
}): Promise<T> {
  const { provider, model } = aiConfig();
  if (provider === "gemini") {
    return generateGemini({ ...options, model, apiKey: env("GEMINI_API_KEY") });
  }
  // Explicit rollback only. A Gemini failure never sends workspace data to a
  // second provider or silently returns a demo answer.
  const client = new OpenAI({
    apiKey: env("OPENAI_API_KEY"),
    timeout: options.timeoutMs ?? 30000,
    maxRetries: 1,
  });
  const response = await client.responses.parse({
    model,
    store: false,
    input: [{ role: "system", content: options.system }, {
      role: "user",
      content: JSON.stringify(options.input),
    }],
    text: { format: zodTextFormat(options.schema, options.schemaName) },
    max_output_tokens: options.maxOutputTokens,
  });
  return options.schema.parse(response.output_parsed);
}
