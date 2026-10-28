# Release evidence

## Implemented and locally verifiable

- React Flow canvas, visual groups, list view and worker/project drawer.
- Local demo persistence/reset; deterministic AI; explicit payment simulation.
- Immutable accepted terms, Drive deliveries, itemized revision responses,
  zero-price waivers, approved additions, comments and activity.
- Supabase Auth integration, employer/worker checks, row policies and server-only
  transactional commands; normalized project entity records.
- Structured-output model endpoints with quote checks and rate limiting.
- Single seller sandbox invoicing, durable webhook inbox, deduplication,
  reconciliation leases, retries and settlement normalization.

## Provider release gates — require configured accounts

These are not implied by a successful local build or by the demo.

1. Create/link a dedicated CrewCanvas Supabase project. Do not apply migrations
   to any unrelated existing project.
2. Apply migrations, run the seed, and verify Myron/Ava sign-ins in separate
   browser contexts. Workers must have no peer-project access.
3. Set the OpenAI key in Edge Function secrets; run the 16-case evaluator.
   Require 16 valid/cited outputs, all four mixed cases split correctly,
   and at least 14 expected classifications.
4. Configure one sandbox business seller, matching REST app, personal payer,
   webhook ID, and the dedicated Ava seller connection.
5. Create a NEW project in integrated mode, obtain worker acceptance, submit
   and accept delivery, create/send the invoice, and pay on the sandbox site.
6. Verify an actual signed webhook and matching PayPal GET invoice state.
   Re-deliver it and confirm one inbox row and unchanged settlement totals.
7. Confirm pending and partial payments are not represented as fully paid.
   Treat API timeouts/unknown creation outcomes as unresolved, without a new
   invoice or false success. Verify manual refresh and scheduled retries.
8. Enable the reconciliation schedule; inspect failures in the function logs
   and the private inbox. A disabled scheduler is not a complete integration.
9. Deploy with VITE_APP_MODE=integrated and correct public Supabase settings.
   Configure allowed origin/auth redirects for the deployed frontend URL.
10. Rehearse the README demo, record the six-minute video, and retain provider
    invoice/event references as evidence. Reset only browser demo fixtures.

## Four-person handoff

| Owner | Area                                      | Review partner |
| ----- | ----------------------------------------- | -------------- |
| A     | Canvas, layout, responsive UI             | B              |
| B     | Drawer/forms, AI prompts/evaluation       | C              |
| C     | Auth, schema, domain commands             | D              |
| D     | PayPal, webhooks, reconciliation, release | C              |

Working days: 1 spikes/contracts; 2 frontend vertical slice; 3–4 full demo and
domain persistence; 5 first real model/payment; 6–7 integration and retry paths;
8 feature freeze; 9 regression/rehearsal; 10 submission buffer.
