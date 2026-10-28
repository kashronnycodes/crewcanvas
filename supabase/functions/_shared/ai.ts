import {
  AI_SYSTEM,
  BRIEF_INSTRUCTIONS,
  REVISION_INSTRUCTIONS,
} from "../../../shared/ai-prompts.ts";
import OpenAI from "npm:openai@6.15.0";
import { zodTextFormat } from "npm:openai@6.15.0/helpers/zod";
import {
  briefOutputSchema,
  scopeOutputSchema,
} from "../../../shared/validation.ts";
import { activeAgreement, verifySources } from "../../../shared/domain.ts";
import type { Project, SessionActor } from "../../../shared/types.ts";
import { env, HttpError, providerStore } from "./backend.ts";
const system = AI_SYSTEM;
export async function extractBrief(brief: string, actor: SessionActor) {
  return generate("brief", { brief }, actor);
}
export async function compareRevision(
  p: Project,
  text: string,
  actor: SessionActor,
) {
  const agreement = activeAgreement(p);
  if (!agreement)
    throw new HttpError(
      409,
      "CONFLICT",
      "Accept an agreement before comparing scope.",
    );
  const result = await generate(
    "revision",
    {
      request: text,
      acceptedAgreement: {
        id: agreement.id,
        clauses: agreement.clauses,
        revisionRounds: agreement.revisionRounds,
        consumedRounds: p.revisions.filter((r) => r.roundConsumed).length,
      },
    },
    actor,
    p.id,
  );
  if ("items" in result) verifySources(result.items, agreement);
  return result;
}
async function generate(
  kind: "brief" | "revision",
  input: unknown,
  actor: SessionActor,
  projectId?: string,
) {
  const allowed = await providerStore("ai_allow", { actorId: actor.id });
  if (!allowed)
    throw new HttpError(
      429,
      "RATE_LIMIT",
      "Please wait a minute before requesting another AI analysis.",
    );
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-6-astra";
  const client = new OpenAI({
    apiKey: env("OPENAI_API_KEY"),
    timeout: 30000,
    maxRetries: 1,
  });
  try {
    const instructions =
      kind === "brief" ? BRIEF_INSTRUCTIONS : REVISION_INSTRUCTIONS;
    const response = await client.responses.parse({
      model,
      store: false,
      input: [
        { role: "system", content: `${system}\n${instructions}` },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        format:
          kind === "brief"
            ? zodTextFormat(briefOutputSchema, "brief_suggestion")
            : zodTextFormat(scopeOutputSchema, "scope_comparison"),
      },
      max_output_tokens: 6000,
    });
    if (!response.output_parsed)
      throw new HttpError(
        502,
        "AI_UNAVAILABLE",
        "AI could not analyze this request. Retry or continue with manual review.",
      );
    const validated =
      kind === "brief"
        ? briefOutputSchema.parse(response.output_parsed)
        : scopeOutputSchema.parse(response.output_parsed);
    await providerStore("ai_run", {
      actorId: actor.id,
      projectId: projectId ?? null,
      kind,
      model,
      promptVersion: "crew-scope-v1",
      result: validated,
    });
    return { ...validated, mode: "live" as const };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(
      "AI provider failure",
      error instanceof Error ? error.name : "Unknown",
    );
    throw new HttpError(
      502,
      "AI_UNAVAILABLE",
      "AI is unavailable or returned an invalid result. Retry or continue with manual review.",
    );
  }
}
