# CrewCanvas backend verification — 1 November 2026 (Asia/Manila)

This report records the original backend/payment verification. OpenAI's quota blocker was
subsequently bypassed by the verified Gemini migration; see [current AI verification](gemini-verification.md).

Target: **CrewCanvas_HACKATHON**, `tsnwowlyrlxpwwetmxns`, isolated `ronnybraces` login.
All provider work used PayPal Sandbox. Picklaro was not accessed or modified.
No Vercel production frontend deployment or merge to `main` was performed.

## Results

| Check | Result | Actual evidence / limit |
|---|---|---|
| Required secrets | PASS: names present | OpenAI key; PayPal client ID/secret, merchant ID, seller/payer emails and webhook ID; allowed origin. Values/digests withheld. Presence does not imply funded AI quota. |
| PayPal registration | PASS | PayPal's API confirmed the configured webhook ID in the same Sandbox app, exact deployed callback URL and all five required invoice subscriptions. |
| Database / RLS | PASS | Seven applied migrations; RLS on 13/13 public and 9/9 private application tables; actual cross-workspace/peer reads and direct privilege escalation denied. |
| Auth | PASS with limit | Three synthetic users signed in, accepted email-bound invitations and signed out. A separate real browser sign-in/session-restore/sign-out passed. Real inbox confirmation delivery remains untested. |
| Private file storage | PASS | Private 25 MiB bucket; actual upload and authorized signed download, two versions, revision/resubmission and evidence-retention checks passed. |
| Employer → freelancer workflow | PASS | Assignment, bilateral agreement, delivery, included correction, accepted paid addition, revised submission and employer approval persisted. API/storage workflow tested; not every step was repeated through two browser windows. |
| Frontend integration | PASS locally | Browser created a synthetic workspace, restored Auth/workspace after reload, saved settings and showed the saved name in the canvas. No redesign. |
| OpenAI generation | BLOCKED / failed live call | Real synthetic brief extraction returned insufficient API quota. Prior fixed diagnostic identified `credit_balance_exhausted` / `insufficient_quota`. No successful live summary or quality evaluation is claimed. User deferred AI retry. |
| PayPal invoice | PASS | Real approved USD 1.25 Sandbox invoice created, retrieved unpaid, then manually paid by the separate personal Sandbox payer. |
| PayPal payment verification | PASS | Trusted GET/reconciliation reports paid, USD 1.25 settled, zero pending, work still accepted. Repeated retrieval retains exactly one invoice and one transaction record. No browser-success flag or simulated payment was used. |
| Genuine webhook | PASS for invoice-created and invoice-paid events | The user's paid-event resend reached the deployed parsing fix and returned HTTP 200 at 02:20:31 Manila time. Both genuine events passed signature verification and were durably processed. There is one paid-event row, one invoice and one unique transaction record after repeated GET reconciliation and the paid callback. A repeat of the identical callback has not separately been observed. |
| Public endpoint security | PASS | Five reconcile/admin routes each rejected anonymous, public-key and normal signed-in app callers. Malformed/unsigned webhooks rejected; forged signature failed closed through the actual PayPal verification API, with no forged inbox row. |
| Scheduler | PASS | One active minute job; recent scheduled requests returned HTTP 200, no timeout/error. Anonymous/app users cannot read decrypted Vault secrets. |
| Automated checks | PASS | 89 tests / 16 files; frontend TypeScript + Vite build; all three Edge Function type checks; 13 live core integration groups; eight live endpoint-security groups. Production npm audit: zero vulnerabilities. |

Webhook URL:

```text
https://tsnwowlyrlxpwwetmxns.supabase.co/functions/v1/paypal-webhook
```

Configured events: `INVOICING.INVOICE.CREATED`, `INVOICING.INVOICE.UPDATED`,
`INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.CANCELLED`, `INVOICING.INVOICE.REFUNDED`.
The deployed webhook has `verify_jwt=false`; signature verification is its authentication.
Reconcile also has platform JWT checks disabled but independently requires a service key,
validated through a database RPC executable only by `service_role`.

## Bugs fixed and verified

1. First-time seller setup failed because the lookup raised on zero connections. Migration
   `20261031174301_seller_lookup_bootstrap.sql` returns NULL for absence, keeps service-only
   permissions and leaves ambiguous mappings forbidden. Bootstrap and uniqueness tests pass.
2. Genuine PayPal invoice events used `resource.invoice.id`; the original handler read only
   `resource.id`. Both shapes now work, and conflicting/invalid IDs are rejected. A real signed
   event subsequently passed through the complete callback/inbox/reconciliation path.
3. Signature verification now embeds the original received JSON in PayPal's verification
   envelope, preserving whitespace, escapes and numeric spelling. Regression tests cover this
   [PayPal requirement](https://developer.paypal.com/api/rest/webhooks/rest/).

Fresh core regression runs can use `npm run test:integrated -- --preserve-fixtures`, avoiding
replacement of the established seller membership and resumable paid invoice fixture.
The service-only event diagnostic is restricted to the synthetic Sandbox invoice and can
request redelivery only of genuine PayPal events belonging to that invoice.

## Security findings and remaining launch work

- Fund the OpenAI API project or replace its server secret with a funded API-project key;
  then rerun synthetic AI verification and the live quality evaluator. No key belongs in chat,
  browser configuration or Git.
- The paid-event callback is now confirmed. An optional repeat of the identical callback can
  complete the remaining transport-level duplicate rehearsal; payment idempotence across
  repeated provider GET reconciliation and genuine paid-event processing already passed.
- Hosted Auth leaked-password protection is disabled. Review availability and enable it
  before public rollout: [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- The advisor flags managed `pg_net` extension metadata in `public`. Hosted metadata confirms
  it is non-relocatable; do not force catalog edits or drop the functioning scheduler:
  [Supabase guidance](https://supabase.com/docs/guides/database/extensions/pg_net).
- Rehearse actual email confirmation and the complete two-person browser demo on the protected
  integrated preview. The production site still runs the existing demo.
- The single Sandbox seller maps to the retained synthetic freelancer. Use that fixture for
  rehearsal; changing the seller to a teammate requires a reviewed mapping change that preserves
  the paid invoice history. Multi-seller onboarding and Payouts are not implemented.
- Review the integration PR and obtain explicit approval before merging/deploying production.

## Reproducible checks and retained evidence

Follow-up after the user's failed-event resend: Supabase identifies the caller as
`PayPal/AUHD-1.0-1` and reports HTTP 200 with 4,841 ms execution time. The paid event was
received at 02:20:27 and processed at 02:20:31 on 1 November 2026 (Asia/Manila), with no
stored processing error. The prior nested invoice-ID parsing fix was already deployed;
no additional backend deployment or relaxation of signature verification was needed.
Rechecking the actual provider invoice still returns USD 1.25 fully settled, zero pending.
The 22 focused invoice/signature tests, all three server type checks and all eight live
endpoint-security groups passed again. The historical failure response body was not retained
in the available logs; the earlier direct-only ID guard rejects the genuine wrapped resource,
and the current handler successfully processes it.

```powershell
npm test
npm run build
npm run check:server
npm run test:integrated -- --preserve-fixtures
npm run test:endpoint-security
npm run test:paypal-flow -- --verify
```

Non-secret test references/results stay in ignored `.supabase/`: `integration-rerun-results.json`,
`ai-verification.json`, `paypal-setup.json`, `paypal-flow.json`, `webhook-delivery.json`,
`endpoint-security.json`, and `frontend-verification.png`. Test records are retained; user
workspaces were not reset or deleted. Provider credentials and server keys remain in backend
secrets or process memory, never in these artifacts or public source.
