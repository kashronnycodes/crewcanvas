# CrewCanvas

A visual workspace for creative teams: people, clear agreements, deliveries,
thoughtful revisions, and payments in perspective.

[Open the live demo](https://crewcanvas.vercel.app) ·
[GitHub repository](https://github.com/kashronnycodes/crewcanvas)

The deployed app runs in **demo mode**: AI and payments are simulated, and each
browser keeps its own workspace and uploaded files. Sharing the link does not
synchronize teammates' data. Live authentication, shared storage, AI, and PayPal
Sandbox require the integrated setup below.

CrewCanvas 2.0 adds persistent file cards, project/payment/revision nodes, contextual
inspectors, meaningful connections, focus modes, financial flow, a workspace command
bar and an activity timeline. See [the implementation handoff](docs/crewcanvas-2-handoff.md)
for the migration, environment setup, actual test results and external verification gates.

## Run locally

Requires Node.js 24 and npm.

```powershell
git clone https://github.com/kashronnycodes/crewcanvas.git
cd crewcanvas
npm ci
npm run dev
```

Open the printed local URL. No external accounts are needed in the default demo.
The banner explicitly identifies deterministic AI and simulated payments.
Changes persist in this browser; Reset Demo restores the Northstar fixtures.
The demo role selector is a presentation aid, not authentication.

## Features

- React Flow whiteboard with movable people, curved connections, collapsible
  role groups, renaming, membership controls, zoom, fit, and persistent layout.
- Canvas/list views, search, mobile list, and worker/project details drawer.
- Versioned agreements; original accepted terms remain read-only and visible
  in history. Changes require the other party's acceptance.
- Google Drive/Docs link submissions with labels and a delivery review cycle.
- Advisory AI scope comparisons, included work, clarification, extra-work
  proposals, manual pricing, zero-price waivers, rebasing, and project comments.
- Independent completion/payment indicators and unique project aggregation.
- Real Supabase/AI/PayPal integration code, separate from local simulation.

## Architecture

```text
React UI → typed repository / scope assistant / payment gateway
                 ├─ demo: browser-local state + deterministic responses
                 └─ integrated: authenticated Supabase Edge API
                      ├─ PostgreSQL: project entities, immutable terms, audit
                      ├─ OpenAI: validated structured suggestions
                      └─ PayPal Sandbox: invoices, verified events, reconciliation
```

`src/` contains UI and adapters. `shared/` contains domain contracts, validation,
money/status helpers and fixtures. `supabase/` contains the migration and backend.
The frontend is a Vite static build; it needs no Node server after deployment.

Projects, agreements, deliveries, revision requests, proposals, invoices and
activity are separate database records. Their JSON payloads implement shared
TypeScript contracts; critical ownership, identity, version and monetary fields
also have relational constraints. Writes commit atomically through a server-only
RPC with optimistic project versions. Accepted agreement and activity records
have database immutability triggers.

The layout is a separate record. Group positions are world coordinates; member
positions are relative to their group. Collapsing retains every member. Moving
or regrouping cannot alter memberships, project assignments or seller identity.

## Enable the integrated build

Provision a **dedicated CrewCanvas Supabase project**. Do not migrate an unrelated
project. No existing connected Supabase projects are assumed to belong to this app.

1. Install/use the official Supabase CLI (`npx supabase --help`). Authenticate,
   link the new project, and apply the migration with `npx supabase db push`.
2. In Supabase Auth, disable public sign-up and configure the frontend Site URL
   and the allowed invitation redirect `<frontend-origin>/?invite=1`.
3. Set secrets for Edge Functions using the dashboard or CLI. The variable names
   are in `supabase/functions/.env.example`; do not commit actual values.
4. Deploy `crew-api`, `paypal-webhook`, and `reconcile`. The function configuration
   keeps JWT verification on for the user API. Only provider/scheduler endpoints
   disable it; those verify their own provider signature or server API key.
5. Seed from a shell with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a
   `CREW_SEED_PASSWORD` of at least 12 characters:

   ```powershell
   npm run seed:integrated
   ```

   This creates the seven presenter accounts and sample projects. Sign in as
   `myron@northstar.example` or `ava@northstar.example` with that password.
   Rerunning preserves existing accounts, layouts, projects and payment history.

6. Copy `.env.example` to `.env`; set `VITE_APP_MODE=integrated`, the project URL,
   and its browser publishable key. Restart Vite or rebuild the static frontend.

The server uses Supabase's injected `SUPABASE_SERVICE_ROLE_KEY` only on the backend.
Never put secret/service keys, OpenAI keys or PayPal credentials in `VITE_` variables.
Integrated mode does not fall back to mock data when a provider fails.

### Invitations and authorization

Myron generates an invitation link for manual sharing. No custom email service
is required. The invited worker chooses a password and receives only their own
project access. Existing-account or expired-link errors require a fresh invitation
or administrator help; they never grant employer access.

Every API call verifies the actual Auth user and current database membership.
Workers cannot read peers, modify the canvas, accept their own delivery or
approve their own fees. Row policies enforce read isolation, direct client writes
are revoked, and transactional/provider RPCs are granted only to the server role.
Browser role claims and user-editable metadata never authorize actions.

## Real AI

Set server secrets `OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-6-astra`).
Brief extraction proposes editable tasks/deliverables. Revision comparison uses
the accepted agreement's numbered clauses and current revision allowance.
Both endpoints call Responses structured output, validate Zod schemas, and keep
human approval outside the model. Source quotes are checked against the actual
agreement. Calls are limited to ten per user per minute.

The live evaluation suite shares the exact runtime prompt:

```powershell
npx deno run --allow-env --allow-net --config supabase/functions/deno.json scripts/evaluate-ai.ts
```

It requires `OPENAI_API_KEY` in the shell and makes 16 billable model calls.
Passing means no fabricated quotes, all mixed requests split, and at least 14/16
expected classifications. Do not claim the live gate passed without running it.
Deterministic fixture tests do not substitute for model evaluation.

## Real PayPal sandbox integration

Only **Ava Cruz** is supported as a connected seller in this build. A freelancer
needs their own supported PayPal business account with Invoicing enabled.
An application's credentials do not authorize every freelancer. Full seller
onboarding requires PayPal partner eligibility/permissions and is deferred.

Configure these server secrets:

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`: REST app belonging to the sandbox
  business seller.
- `PAYPAL_MERCHANT_ID`, `PAYPAL_SELLER_EMAIL`: that same seller's identifiers.
- `PAYPAL_PAYER_EMAIL`: a **different personal sandbox account**, representing Myron.
- `PAYPAL_WEBHOOK_ID`: the registered webhook for that REST app.
- `ALLOWED_ORIGIN`: exact frontend origin, without a trailing slash.

Also provide the merchant ID and seller email to the seed shell and rerun the
seed; it records Ava's non-secret seller connection. Credentials stay in secrets.
New connected-seller projects can create invoices. Historical sample projects
cannot create real invoices, even when assigned to Ava.

Register the public HTTPS `.../functions/v1/paypal-webhook` URL for
`INVOICING.INVOICE.CREATED`, `UPDATED`, `PAID`, `CANCELLED`, and `REFUNDED`.
The handler sends the received event and PayPal signature headers back to
PayPal's verification endpoint. Simulator mock events do not support that
postback verification; use an actual sandbox invoice to verify the flow.

After delivery acceptance, Ava issues the invoice. Approved charges are allocated
once, a draft is created, its provider ID is saved, and only then is it sent.
PayPal's returned sandbox recipient URL opens its hosted payment page.
The payer uses the separate personal sandbox account; no live funds are involved.

Every invoice is bound to its project, seller, currency and approved charges.
New accepted additions use supplemental invoices. Charge allocations, persistent
invoice operation IDs and `PayPal-Request-Id` prevent duplicate billing. If create
has an ambiguous outcome, the reservation remains unresolved and reconciliation
searches by its unique invoice number before any further action. It does not
blindly create a replacement invoice.

A `PAID` webhook event alone is not payment proof: it can indicate a partial or
pending payment. Reconciliation fetches the current invoice; completed requires
full provider settlement and zero due balance. Pending funds, manual externally
marked payments, unknown states and browser redirects never mark work paid.
Provider cancellation/refunds remain explicit; refunds/credits are managed in PayPal.

### Required retry scheduler

Verified webhook events are stored durably before acknowledgement. Unique event
IDs deduplicate repeats; unfinished events remain retryable. Per-invoice leases
serialize reconciliation. The browser polls integrated data every 15 seconds,
and project participants can request a manual refresh.

Set Vault secrets `crewcanvas_project_url` and `crewcanvas_service_key`, then run
`docs/schedule.sql` once. The minute job retries unfinished events and reconciles
the first 200 sandbox invoice rows, sufficient for this bounded hackathon demo.
Use a paginated job before expanding beyond that size. Do not schedule it twice.
Inspect reconciliation function logs and `private.webhook_events.last_error` for
failures. Without this schedule, acknowledged-but-unfinished events are not a
complete reliable integration.

## Rules worth preserving

- USD amounts are integer cents. Strings cross JSON boundaries; no floating-point
  arithmetic determines totals. Currency is immutable after acceptance.
- Green counts accepted projects. Red counts projects with collectible amounts
  due today/overdue or actionable invoice/payment failure. Pending covered funds,
  future balances and unapproved proposals do not automatically become red.
- One consolidated accepted revision request consumes at most one round;
  clarification/additions consume none. Workers can waive round consumption.
  Exhaustion never creates a fee.
- Extra work changes the total only after employer acceptance. Zero-price waivers
  retain history. Stale proposals need worker rebasing before employer approval.
- Sample histories, real sandbox invoices and local simulations have visible
  labels. Reset affects only the local demo, never external invoice history.

## Tests and release

```powershell
npm test
npm run build
npm run check:server
```

Tests include real embedded PostgreSQL migration/RLS execution through PGlite,
unauthorized reads/writes, forged role metadata, immutable terms, duplicate
commands/events, stale versions, layout preservation, exact cents, independent
status counts, revision approval and provider-state normalization. Docker is not
required for those tests; the Supabase CLI local stack can additionally be used.

The source includes a CI workflow. If this folder is kept inside a larger repo,
place the workflow at that repo's `.github/workflows/` and set its working
directory/cache dependency path to `crewcanvas`.

See `docs/release-checklist.md` for the external release gates and four-developer
handoff. A local build does not demonstrate configured authentication, a real
model call, or a completed PayPal sandbox payment.

## Six-minute demo

1. Myron shows Northstar, collapses/moves a group, refreshes, and restores it.
2. Show Leo's independent accepted-work and overdue-payment indicators.
3. Create a new Launch Teaser for Ava; extract/edit tasks; propose $120 terms.
4. Ava accepts in her own session and submits a shared Drive link marked v1.
5. Myron requests a spelling correction and second ending; show AI scope evidence.
6. Ava includes the correction, proposes $30 extra; Myron accepts. Total: $150.
7. Ava submits v2; Myron accepts. Work completes while payment is outstanding.
8. Ava issues the sandbox invoice; Myron pays on PayPal's hosted sandbox page.
9. Show verified reconciliation, zero balance, invoice reference, and acceptance
   remaining intact. In the local demo these last actions are explicitly simulated.

## Official references

- [React Flow grouping](https://reactflow.dev/learn/layouting/sub-flows)
- [Supabase function authentication](https://supabase.com/docs/guides/functions/auth)
- [Supabase table grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [PayPal invoice setup](https://developer.paypal.com/api/invoicing)
- [PayPal partner dependency](https://developer.paypal.com/platforms/invoicing/integrate)
- [Invoice event semantics](https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/)
- [Webhook signature verification](https://developer.paypal.com/api/rest/webhooks/rest/)
