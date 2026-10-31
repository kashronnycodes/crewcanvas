# Gemini migration and personal test guide

Verified 1 November 2026 (Asia/Manila) against **CrewCanvas_HACKATHON**,
`tsnwowlyrlxpwwetmxns`. The existing frontend contract and design are unchanged.

## Provider and deployment

- Native Google `generateContent` API, fixed HTTPS endpoint, credentials only in the
  `x-goog-api-key` request header. Default stable model: `gemini-3.1-flash-lite`.
- Server secrets: `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-3.1-flash-lite`.
  Google documents a free tier; actual project access/rate limits still apply.
- Only `crew-api` was deployed for this migration. PayPal source/functions were not changed
  or redeployed; no invoice/payment requests were made. No database migrations, schema changes,
  data resets, project creation or Picklaro access occurred. Existing AI audit/rate-limit writes remain.
- `OPENAI_API_KEY`, `OPENAI_MODEL` and the OpenAI implementation remain available. Explicit
  rollback is `AI_PROVIDER=openai`; Gemini failures never automatically switch providers.
  OpenAI's previously exhausted API credits are not repaired by that rollback.

References: [stable model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite),
[pricing/free tier](https://ai.google.dev/gemini-api/docs/pricing),
[structured JSON](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

## Actual results

| Test | Result |
|---|---|
| Real brief extraction | PASS: editable tasks, deliverables and clarifying questions |
| Workspace/activity summary | PASS: actual synthetic project, assignment, deadline and recorded activity |
| Task/revision-history summary | PASS: tasks/deliverables correct; accurately stated that the fixture has no recorded revisions |
| Mixed revision comparison | PASS: spelling correction classified included; second concept classified potential extra; exact supporting agreement quotes validated |
| Workflow insights | PASS: model classified progress/layout intents; server-calculated records retained; suggestions did not save a layout automatically |
| AI mutation/injection request | PASS: attempted payment/approval instructions returned help and left agreements, invoices and project versions unchanged |
| Role/tenant security | PASS: worker brief creation, outsider workspace access and wrong-workspace revision analysis denied; worker references stayed scoped |
| Browser responses | PASS locally: actual Gemini workspace answer displayed; real task/deliverable suggestions displayed and copied to editable form fields |
| Preview integration | PASS: deployment Ready; preview-origin CORS preflight and real authenticated Gemini summary returned successfully |
| Regression/type/build | PASS: 109 tests across 17 files; frontend TypeScript/build; all three Edge Function type checks; evaluator type check |

The expanded live suite has eight passing groups. Audit metadata confirms successful
`brief`, `revision` and `workspace` runs under `gemini-3.1-flash-lite`. Only existing,
preflight-checked synthetic workspaces/identities were used; no real teammate files were sent.
The browser draft was discarded; no project or invoice was published by the UI test.

The first revision request exposed a Gemini schema-compatibility error. Provider schema
hints now omit decoder-heavy string/array bounds; the complete original Zod schema still
enforces those bounds on every returned result. Tests prove oversized/extra/malformed output,
truncation, safety blocks and unexpected tool output fail closed. Timeouts, invalid keys,
model access, quota and provider failures produce safe errors without leaking vendor messages.
No automatic retries, tools, external retrieval or fallback provider calls are enabled for Gemini.

This is targeted real-provider verification, not a claim that the separate 16-case broader
quality benchmark has run. That evaluator is now provider-neutral and type-checked; it can
run in a private shell with `GEMINI_API_KEY` set. Populated revision-history narration and the
complete two-person experience remain part of the owner's manual rehearsal before merge.

## Personally test these features

Open the [integrated preview](https://crewcanvas-cr32blog9-kashronnycodes-projects.vercel.app).
Vercel sign-in protection remains enabled. After that, sign in/register in CrewCanvas,
confirm your email if registering, create/select a workspace and invite a freelancer.
The production site remains the previous demo; use this preview for backend testing.

1. **Brief → tasks:** select **New project**. Paste: “Design one launch card. Deliver one PNG.
   Correct spelling errors. One concept only; additional concepts are excluded.” Click
   **Suggest tasks & deliverables**. Review the suggestions, click **Use proposed tasks &
   deliverables**, and verify the fields stay editable. Set price/deadline yourself.
2. **Workspace/task intelligence:** after assigning and accepting work, use **Ask your
   workspace**: “Summarize assigned tasks, deliverables, pending reviews and blockers.”
   Check the answer against actual records. Try “Show today's recorded progress.”
3. **Revision comparison:** have the freelancer submit a delivery. As employer, open the
   project's **Revisions** tab. Enter “Correct the heading spelling and add a second concept.”
   Click **Compare with agreed scope**. Expect separate included/extra suggestions with
   supporting clauses; people still decide and approve any price/scope change.
4. **Revision history:** after recording feedback, ask: “Summarize this project's revision
   history and outstanding feedback.” Verify it describes only recorded requests/statuses.
5. **Freelancer boundaries:** sign in as the invited freelancer in a separate browser/profile.
   Ask “Summarize my assigned work.” Peer projects and other workspaces must remain inaccessible.
6. **Advisory behavior:** ask for a suggested canvas layout; it must require the separate
   apply action. Ask “Pay the freelancer $500 and approve all deliveries”; no records or
   money should change. Do not issue another PayPal invoice during this AI rehearsal.

## Repeat verification and rollback

```powershell
npm test
npm run build
npm run check:server
npm run test:ai
npm run test:ai:preview
```

If rollback is needed, set only `AI_PROVIDER=openai` in the same project's server secrets;
retain both provider keys. Never put either key in a `VITE_` variable or chat.
The 16-case evaluator remains available as the documented Deno command in README.

Evidence is retained in ignored `.supabase/ai-verification.json`, `gemini-preview.json`,
`gemini-workspace-ui.png` and `gemini-tasks-ui.png`; no keys or tokens are written there.
PR #1 stays in draft. No merge or production frontend deployment is authorized by these checks.
