# CrewCanvas

CrewCanvas connects projects, roles, members, and tasks with files, revisions, AI, and PayPal Sandbox payments.

Licensed under the [MIT License](LICENSE).

Owners manage work in **Project Studio**. Regular members land on **My Tasks**, which contains only their assignments. **Project Whiteboard** holds task-scoped notes and drawings without a second set of task controls. Clicking a member shows their name and project role. The workspace menu contains invitations, settings, help, and sign-out. See [task and member navigation](docs/member-navigation.md).

Every account signs in through Supabase and uses the same database, storage, AI, and permissions. `?demo=1` and old build-mode flags cannot enable a simulator. Old browser records are left untouched but are not used as app data. Theme and workspace preferences, authentication sessions, and unsaved board recovery drafts still use browser storage.

Read the [simplification report](docs/ui-simplification.md) for current verification and screenshots. Older dated reports describe previous releases.

## Run locally

Requires Node.js 24 and npm.

```powershell
npm ci
Copy-Item .env.example .env.local
# Set VITE_SUPABASE_PUBLISHABLE_KEY for the configured project.
npm run dev
```

A Supabase URL and browser publishable key are required. Sign in with an existing account, or create an account if registration is enabled. Missing configuration or unavailable integrations show errors. Payments remain in their configured Sandbox environment.

## Architecture

```text
React UI → authenticated Supabase API
             ├─ PostgreSQL: memberships, assignments, terms, revisions and invoices
             ├─ Private storage: versioned files with authorized signed URLs
             ├─ Configured AI provider: real suggestions, no simulated fallback
             └─ PayPal Sandbox: verified invoices, events and reconciliation
```

Accepted terms and financial history retain their original IDs. Role labels organize work; backend membership and task assignments control access. No account or record migration is needed for the interface update.

## Configure the backend

The verified backend is **CrewCanvas_HACKATHON** (`tsnwowlyrlxpwwetmxns`) in the
`ronnybraces` organization. Do not create another project or use a Picklaro project.
See [the backend integration handoff](docs/backend-integration.md) for actual
verification, applied migrations, environment separation, and remaining provider gates.

1. Copy `.env.example` to `.env.local`; set the project's browser publishable key. The URL is already included in the example.
2. Run `npm ci` and `npm run dev`. Sign up, confirm the email, then sign in.
3. Create a workspace, invite the intended freelancer by email, and manually share
   the generated invitation link. Existing accounts can accept the same flow.
4. The freelancer signs in using the invited, verified email and accepts the invitation.
5. Create an assigned project and proposed agreement; use the existing review workflow.

`npm run setup:integrated` securely configures the local public variables for the
owner's isolated CLI profile. Ordinary teammates can set these public values manually.
The optional `npm run seed:integrated` remains available for the older presenter
fixtures; it is not required for registration or workspace creation.

The server uses Supabase's injected `SUPABASE_SERVICE_ROLE_KEY` only on the backend.
Never put secret/service keys, Gemini/OpenAI keys or PayPal credentials in `VITE_` variables.
Integrated mode does not fall back to mock data when a provider fails.

### Invitations and authorization

Employers generate a seven-day, email-bound invitation link for manual sharing.
Only its SHA-256 hash is stored in the private schema. The recipient must sign in
with the invited, verified email before accepting; new and existing accounts work.
An invitation grants a worker membership, never an employer role. Memberships are
workspace-specific, so the same account can belong to multiple workspaces.

Every API call verifies the actual Auth user and current database membership.
Workers cannot read peers’ task data, change project organization, approve their own delivery or
approve their own fees. Row policies enforce read isolation, direct client writes
are revoked, and transactional/provider RPCs are granted only to the server role.
Browser role claims and user-editable metadata never authorize actions.

## Real AI

The default provider is Google Gemini's native API, using the stable
`gemini-3.1-flash-lite` model. Set server secrets `GEMINI_API_KEY`,
`AI_PROVIDER=gemini`, and optionally `GEMINI_MODEL`. Google lists a free tier;
actual access and limits depend on the API project. See [the Gemini verification
and manual test guide](docs/gemini-verification.md).
Workspace questions can summarize authorized project progress, assigned work,
deliverables, pending reviews, blockers and revision histories. Structured
summaries reference validated project IDs; financial totals remain calculated
by server code. Context is bounded and never includes credentials or file binaries.
Brief extraction proposes editable tasks/deliverables. Revision comparison uses
the accepted agreement's numbered clauses and current revision allowance.
Both endpoints request structured JSON, validate the full original Zod schemas, and keep
human approval outside the model. Source quotes are checked against the actual
agreement. Calls are limited to ten per user per minute.

The live evaluation suite shares the exact runtime prompt:

```powershell
npx deno run --allow-env --allow-net --config supabase/functions/deno.json scripts/evaluate-ai.ts
```

It defaults to Gemini and requires `GEMINI_API_KEY` in the private shell environment;
it makes 16 provider calls, subject to that project's quota/billing. The evaluator is
provider-neutral. For explicit rollback, set `AI_PROVIDER=openai` and use the retained
`OPENAI_API_KEY` / `OPENAI_MODEL` configuration (default `gpt-6-astra`). Provider
failures never automatically send the same workspace context to another provider.
Passing means no fabricated quotes, all mixed requests split, and at least 14/16
expected classifications. Do not claim the live gate passed without running it.
Deterministic fixture tests do not substitute for model evaluation.

## Real PayPal sandbox integration

One configured freelancer membership is supported as the connected seller. A freelancer
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

For a workspace created through registration, set `CREW_SELLER_MEMBERSHIP_ID`
in the owner's isolated CLI shell and run `npm run setup:paypal`. The backend
reads merchant/email settings from Supabase secrets and verifies the actual
webhook registration in the same Sandbox REST app. Use `-- --test-fixture` only
to select the labeled synthetic test freelancer. It refuses a different existing
seller or an ambiguous second mapping. The older seed/configure helper remains available.
New connected-seller projects can create invoices. Historical sample projects
cannot create real invoices, even when assigned to Ava.

Register `https://tsnwowlyrlxpwwetmxns.supabase.co/functions/v1/paypal-webhook` for
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

Run `npm run setup:reconcile` through the isolated owner login. It stores the
server key in encrypted Vault and creates one checked minute job. The job is
already active in the verified CrewCanvas project. It retries unfinished events and reconciles
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
  labels. Existing sample financial history remains labeled separately from verified PayPal records.

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

## Official references

- [React Flow grouping](https://reactflow.dev/learn/layouting/sub-flows)
- [Supabase function authentication](https://supabase.com/docs/guides/functions/auth)
- [Supabase table grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini model and pricing](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite)
- [PayPal invoice setup](https://developer.paypal.com/api/invoicing)
- [PayPal partner dependency](https://developer.paypal.com/platforms/invoicing/integrate)
- [Invoice event semantics](https://developer.paypal.com/platforms/invoicing/reference/invoicing-webhooks/)
- [Webhook signature verification](https://developer.paypal.com/api/rest/webhooks/rest/)
## Existing accounts

Existing test and demo accounts use normal sign-in and backend permissions. The sign-in page offers code-protected Employer and Freelancer access to the two fixed payment-tested integration accounts. The backend validates the private code and establishes normal authenticated sessions. There is no role impersonation, simulated AI, local record repository, or simulated payment action. See [judge access setup](docs/judge-access.md).
