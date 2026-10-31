import {
  AI_SYSTEM,
  BRIEF_INSTRUCTIONS,
  REVISION_INSTRUCTIONS,
} from "../../../shared/ai-prompts.ts";
import {
  briefOutputSchema,
  scopeOutputSchema,
} from "../../../shared/validation.ts";
import { activeAgreement, verifySources } from "../../../shared/domain.ts";
import type { Project, SessionActor } from "../../../shared/types.ts";
import { HttpError, providerStore } from "./backend.ts";
import { aiFailure } from "../../../shared/ai-errors.ts";
import { aiConfig, generateStructured } from "./ai-provider.ts";
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
  if (!agreement) {
    throw new HttpError(
      409,
      "CONFLICT",
      "Accept an agreement before comparing scope.",
    );
  }
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
  if (!allowed) {
    throw new HttpError(
      429,
      "RATE_LIMIT",
      "Please wait a minute before requesting another AI analysis.",
    );
  }
  const { model } = aiConfig();
  try {
    const instructions = kind === "brief"
      ? BRIEF_INSTRUCTIONS
      : REVISION_INSTRUCTIONS;
    const options = {
      system: `${system}\n${instructions}`,
      input,
      maxOutputTokens: 6000,
    };
    const response = kind === "brief"
      ? await generateStructured({
        ...options,
        schema: briefOutputSchema,
        schemaName: "brief_suggestion",
      })
      : await generateStructured({
        ...options,
        schema: scopeOutputSchema,
        schemaName: "scope_comparison",
      });
    const validated = kind === "brief"
      ? briefOutputSchema.parse(response)
      : scopeOutputSchema.parse(response);
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
    const failure = aiFailure(error);
    console.error("AI provider failure", failure.code);
    throw new HttpError(failure.status, failure.code, failure.message);
  }
}
