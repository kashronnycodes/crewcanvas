import OpenAI from "npm:openai@6.15.0";
import { zodTextFormat } from "npm:openai@6.15.0/helpers/zod";
import { AI_SYSTEM, REVISION_INSTRUCTIONS } from "../shared/ai-prompts.ts";
import { evaluationBrief, evaluationCases } from "../shared/ai-evaluations.ts";
import { scopeOutputSchema } from "../shared/validation.ts";
import { makeAgreement, verifySources } from "../shared/domain.ts";
const key = Deno.env.get("OPENAI_API_KEY");
if (!key) throw new Error("Set OPENAI_API_KEY in the shell; never commit it.");
const client = new OpenAI({ apiKey: key, timeout: 30000, maxRetries: 1 });
const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-6-astra";
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
    const result = await client.responses.parse({
      model,
      store: false,
      input: [
        { role: "system", content: `${AI_SYSTEM}\n${REVISION_INSTRUCTIONS}` },
        {
          role: "user",
          content: JSON.stringify({
            request: c.request,
            acceptedAgreement: {
              id: agreement.id,
              clauses: agreement.clauses,
              revisionRounds: 2,
              consumedRounds: c.consumedRounds ?? 0,
            },
          }),
        },
      ],
      text: { format: zodTextFormat(scopeOutputSchema, "scope_comparison") },
      max_output_tokens: 6000,
    });
    const output = scopeOutputSchema.parse(result.output_parsed);
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
      `FAIL ${c.id}: ${error instanceof Error ? error.message : "invalid result"}`,
    );
  }
}
console.log(
  JSON.stringify({
    model,
    promptVersion: "crew-scope-v1",
    correct,
    total: 16,
    integrity,
    mixedCorrect,
  }),
);
if (correct < 14 || integrity !== 16 || mixedCorrect !== 4) Deno.exit(1);
