import {
  aiConfig,
  generateStructured,
} from "../supabase/functions/_shared/ai-provider.ts";
import { aiFailure } from "../shared/ai-errors.ts";
import { AI_SYSTEM, REVISION_INSTRUCTIONS } from "../shared/ai-prompts.ts";
import { evaluationBrief, evaluationCases } from "../shared/ai-evaluations.ts";
import { scopeOutputSchema } from "../shared/validation.ts";
import { makeAgreement, verifySources } from "../shared/domain.ts";
const { provider, model } = aiConfig();
let correct = 0;
let mixedCorrect = 0;
let integrity = 0;
for (const c of evaluationCases) {
  try {
    const agreement = makeAgreement(
      {
        brief: c.brief ?? evaluationBrief,
        deliverables: ["One 1080p MP4 in 16:9"],
        amountMinor: "12000",
        currency: "USD",
        deadline: "2027-01-01",
        revisionRounds: 2,
        paymentDays: 7,
      },
      crypto.randomUUID(),
      null,
    );
    const result = await generateStructured({
      schema: scopeOutputSchema,
      schemaName: "scope_comparison",
      system: `${AI_SYSTEM}\n${REVISION_INSTRUCTIONS}`,
      input: {
        request: c.request,
        acceptedAgreement: {
          id: agreement.id,
          clauses: agreement.clauses,
          revisionRounds: 2,
          consumedRounds: c.consumedRounds ?? 0,
        },
      },
      maxOutputTokens: 6000,
    });
    const output = scopeOutputSchema.parse(result);
    verifySources(output.items, agreement);
    integrity++;
    const actual = output.items.map((i) => i.classification).sort();
    const expected = [...c.expected].sort();
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (pass) {
      correct++;
      if (c.category === "mixed") mixedCorrect++;
    }
    console.log(`${pass ? "PASS" : "REVIEW"} ${c.id}: ${actual.join(", ")}`);
  } catch (error) {
    console.error(
      `FAIL ${c.id}: ${aiFailure(error).message}`,
    );
  }
}
console.log(
  JSON.stringify({
    provider,
    model,
    promptVersion: "crew-scope-v1",
    correct,
    total: 16,
    integrity,
    mixedCorrect,
  }),
);
if (correct < 14 || integrity !== 16 || mixedCorrect !== 4) Deno.exit(1);
