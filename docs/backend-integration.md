# CrewCanvas backend integration handoff

## Verified target and release boundary

- Account: `ronnybraces` (`ronnybraces@gmail.com`); organization `ronnybraces`, ID `sqiyfehckywuxvmwbnab`.
- Project: **CrewCanvas_HACKATHON**, `tsnwowlyrlxpwwetmxns`, active, `ap-northeast-1`.
- API: `https://tsnwowlyrlxpwwetmxns.supabase.co`.
- Implementation branch: `codex/supabase-backend-integration`.
- The existing production website remains in demo mode. No production deployment is authorized by this work.
- Supabase plugin access in this Codex chat still refers to the old account. All backend work used the isolated new-account CLI. No Picklaro project was changed.

## Implementation checklist and actual state

| Area | Implemented / verified | Remaining gate |
|---|---|---|
| Account isolation | Separate named credential entry and repo-local CLI state; identity/project guard | Teammates need their own authorized organization membership |
| Database | Existing relational/JSON contracts retained; seven migrations applied | Future schema changes follow reviewed migrations |
| Auth | Signup, confirmation redirect, password sign-in, persisted sessions, sign-out, membership-based roles | Real inbox delivery and a user's signup confirmation still need a manual rehearsal |
| Workspaces | Creation, list/selection, persistent layout, settings; one account can have several memberships | Workspace deletion and member removal are intentionally not exposed |
| Team | Seven-day email-bound invitations, existing/new accounts, member name/creative-role editing | Invitation links are manually shared; no custom email sender |
| Work | Assigned project agreements, included tasks, delivery/revision/approval cycle | Task cards represent project-level agreed work; independent per-line-item assignees/statuses are not implemented |
| Files | Private bucket, server-authorized uploads, immutable version history, signed downloads | Large/resumable uploads, virus scanning and Office previews remain out of scope |
| Activity | Durable project/file/workspace events; recipient-specific unread/read notifications | Fifteen-second polling is used; no Realtime subscription is required |
| PayPal | Registration/seller mapping verified; real USD 1.25 Sandbox invoice paid; signed created/paid callbacks processed; one transaction retained; minute reconciliation returning HTTP 200 | Optional identical-callback duplicate rehearsal and final team rehearsal |
| AI | Responses integration, bounded authorized context and validated IDs; provider failures safely classified | Configured API key reports `credit_balance_exhausted` / `insufficient_quota`; funded API project and live output evaluation needed |
| Deployment | Integrated local environment and protected Vercel preview; production unchanged | Provider gates, manual UI rehearsal and explicit production approval |

## Applied migration history

1. `20261028110143_initial_schema.sql`: workspaces/memberships, projects, immutable agreements,
   deliveries, revisions, proposals, invoices, activity; private provider records and transactional RPCs.
2. `20261030210134_intelligent_canvas.sql`: `workspace_files`, private `crewcanvas-files` bucket,
   workspace activity, version/evidence preservation, authorized financial records.
3. `20261031151845_workspace_onboarding_notifications.sql`: workspace-specific account memberships,
   private hashed invitations, onboarding RPCs, transactional notifications and timestamps.
4. `20261031153517_verified_auth_identity.sql`: narrowly restricted private verified-email helper.
   Real Supabase `service_role` cannot read `auth.users` directly; onboarding uses this helper
   without granting broad access to the Auth schema. The regression tests now use `service_role`.
5. `20261031164710_vault_reconciliation_setup.sql`: restricted setup RPC for one fixed-project
   pg_cron/pg_net job, with encrypted Vault authentication and conflicting configuration refused.
6. `20261031165542_service_role_auth.sql`: verify effective server database role rather than
   compare different valid opaque API keys; enforce one membership per Sandbox merchant.
7. `20261031174301_seller_lookup_bootstrap.sql`: return NULL for an absent seller during
   first-time setup; preserve service-only permissions and rejection of ambiguous mappings.

Migrations were dry-run before application. No existing user data was reset or deleted.
All 13 public application tables and nine private tables have RLS enabled.
The Storage bucket is private with a 25 MiB limit. Browser writes to application tables and
provider RPCs are revoked; workers read only their membership and assigned work.

## Architecture and authorization

The React/Vite app uses the existing typed repository, scope assistant, payment gateway,
React Flow canvas and domain commands. Demo mode remains browser-local and explicitly simulated.
Integrated mode calls `crew-api` with a real Auth JWT, publishable key and selected `X-Workspace-Id`.
That header is a selector only: the server verifies membership using the authenticated user ID.

Membership records are the authoritative workspace profiles and employer/worker roles.
Auth user metadata never grants access. A user becomes owner only of the workspace they explicitly
create, or worker in the workspace whose email-bound invitation they accept.
Invitations store only a SHA-256 hash, expire in seven days and require a verified matching email.
The same invitation cannot add duplicate memberships or promote a worker.

Files pass extension/MIME/signature/size checks. Every signed URL is authorized and expires after
60 seconds. Previously submitted evidence stays attached to its project and exact binary version.
Notifications are inserted in the same database transaction as project/file activity; verified
payment reconciliation also writes project activity. Inbox reads and acknowledgements are recipient-scoped.

## Deployed Edge Functions

| Function | Responsibility | Authentication |
|---|---|---|
| `crew-api` | Workspace onboarding/settings, membership checks, project commands, layout, invitations, notifications, files, AI and invoice requests | Platform JWT verification plus `auth.getUser` and database membership checks |
| `paypal-webhook` | Verify PayPal signature, durably deduplicate the event, queue/reconcile provider state | PayPal postback signature verification; no browser success flag |
| `reconcile` | Retry durable webhook events and refresh bounded invoice records; restricted provider setup/diagnostics | Server key on `apikey`, verified by a service-role-only database RPC; public keys rejected |

The API keeps optimistic versions, immutable accepted terms, integer cents, idempotency keys,
charge allocations and invoice leases. AI has no mutation or money tools. Financial totals remain
calculated by server/domain code; summaries reference only validated, authorized project IDs.
Provider failures never fall back to fake successful invoices or hardcoded live AI answers.

## Environment ownership

| Location | Variables |
|---|---|
| Local `.env.local` / Vercel Preview browser build | `VITE_APP_MODE=integrated`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Future Vercel Production browser build, after approval | Same public variables; currently production remains demo |
| Supabase function secrets | `ALLOWED_ORIGIN`, optional comma-separated exact `ALLOWED_ORIGINS`, `OPENAI_API_KEY`, optional `OPENAI_MODEL`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MERCHANT_ID`, `PAYPAL_SELLER_EMAIL`, `PAYPAL_PAYER_EMAIL`, `PAYPAL_WEBHOOK_ID` |
| Supabase-provided runtime values | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; never copy these into `VITE_` variables |
| Owner seller-setup shell only | `CREW_SELLER_MEMBERSHIP_ID`; `setup:paypal` reads provider settings inside the backend |
| Retry scheduler / Vault | `crewcanvas_project_url`, `crewcanvas_service_key`; configured with `npm run setup:reconcile` |

Only public browser configuration is stored in ignored `.env.local`. Server keys used by setup/test
scripts are retrieved through the isolated CLI into memory and never written to source or logs.
Set provider secrets in [the project secrets dashboard](https://supabase.com/dashboard/project/tsnwowlyrlxpwwetmxns/functions/secrets), never chat.

Hosted Auth keeps email confirmations enabled, uses a 12-character minimum password and allows
the exact local/preview/production redirect origins. CORS allows exact origins, with no wildcard.
Changing the preview deployment URL requires updating both the Auth redirect allowlist and function origins.
Vercel preview protection is preserved; a Vercel login may be required to open review deployments.

## Local setup and collaboration

```powershell
git clone https://github.com/kashronnycodes/crewcanvas.git
cd crewcanvas
git switch codex/supabase-backend-integration
npm ci
Copy-Item .env.example .env.local
# Set integrated mode and the project's PUBLIC publishable key in .env.local.
npm run dev
```

The owner can run `npm run setup:integrated` after the isolated CLI login instead of manually
entering the public key. The helper refuses an unexpected account. `scripts/supabase.ps1` additionally
refuses an unexpected linked project or alternate project reference. It never changes global login state.
The `.supabase/` directory, `.env.local`, deployment state and access credentials are ignored by Git.
On a fresh Windows checkout, `pwsh -NoProfile -File scripts/login-supabase.ps1` creates the isolated
profile from the non-secret template and starts browser login in interactive text mode. Complete
that login as `ronnybraces`, then run `npm run setup:integrated`. This does not change the default
CLI credential entry or default CLI state used by other projects.

Use a new `codex/<feature>` or teammate feature branch, run `npm test`, `npm run build` and
`npm run check:server`, push the branch, and open a pull request targeting `main`.
Review migration SQL and security tests before merging. **Merging to main may trigger the linked
Vercel production deployment, so do not merge this integration until the owner approves production.**

The owner live verification command is `npm run test:integrated`. It uses the real new backend,
creates clearly labeled test accounts/workspaces and retains fixtures without deleting records.
Passwords/tokens stay in process memory. Non-secret evidence is written to ignored
`.supabase/integration-results.json`. The normal regression suite stays deterministic even if
the developer's `.env.local` uses integrated mode.
`npm run test:paypal-config` uses only those labeled test accounts to check owner-only access and
actual Sandbox OAuth authentication. It never creates an invoice or payment and never returns a provider token.

Additional owner-only commands:

```powershell
npm run setup:reconcile
npm run test:ai:prepare
npm run test:ai
npm run setup:paypal -- --test-fixture
npm run test:paypal-flow -- --prepare-only
npm run test:paypal-flow
# Pay the returned Sandbox URL manually with the separate personal Sandbox account.
npm run test:paypal-flow -- --verify
npm run test:endpoint-security
# Fresh core regression fixtures without replacing the established payment test identity:
npm run test:integrated -- --preserve-fixtures
```

`setup:paypal` checks the registered callback and event list using PayPal's API. `--test-fixture`
explicitly maps the seller to the labeled synthetic freelancer; otherwise set the intended
`CREW_SELLER_MEMBERSHIP_ID`. A merchant cannot be silently remapped to another membership.
The paid-flow command is resumable and creates a USD 1.25 Sandbox invoice only when run without
`--prepare-only` or `--verify`. It never submits the payer's payment or fabricates settlement.
The AI verification sends only an isolated, preflight-checked synthetic workspace to OpenAI,
with invented `example.com` identities and no uploads or real client work. Fixtures and results
remain under ignored `.supabase/`; they are retained rather than deleted.

## Verification and limitations

- 89 regression tests pass across 16 files, including executing the full migration chain in PostgreSQL,
  worker/peer isolation, direct-write denial, invitation identity/replay handling, timestamps,
  immutable file evidence, notifications, signup UI, persisted workspace selection, safe provider
  error handling and rejection of missing PayPal transmission signature headers.
- Production frontend build and all three server entry-point type checks pass.
- Thirteen live integration checks passed with three distinct real Supabase accounts. They cover
  sign-in, anonymous denial, idempotent workspace creation, invitation acceptance, assignment,
  bilateral agreement, cross-workspace API/RLS denial, role-escalation denial, saved canvas positions,
  actual private upload/signed download, two file versions, requested revision, revised submission,
  employer approval, notification read persistence, protected evidence and sign-out.
  Employer-only workspace settings and creative-role label editing were also verified without role escalation.
- The live workflow reloads database snapshots throughout; it is an API/storage integration test.
  A separate actual browser test passed sign-in, workspace creation, session/workspace restoration
  after reload, saved settings reflected in the canvas, and sign-out. The full two-person workflow
  has not been replayed entirely through browser clicks; real confirmation-email delivery remains a manual gate.
- The configured `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` successfully authenticated against the
  real Sandbox OAuth endpoint. The worker was denied the owner-only configuration check. The actual
  webhook ID/URL/event subscriptions and single synthetic freelancer mapping are verified.
  The synthetic free correction, USD 0.25 accepted addition, second delivery and final approval
  passed for a USD 1.25 agreement. A real Sandbox invoice was created, manually paid by the user,
  and retrieved through PayPal: USD 1.25 settled, zero pending, work still accepted. Repeated
  retrieval preserved exactly one invoice and one provider transaction record.
- `paypal-webhook` is ACTIVE with `verify_jwt=false`. Public GET returned 405 and malformed POST
  returned 400 from the handler without any Supabase credentials. Signature verification posts
  the complete event and transmission headers to PayPal, and requires `SUCCESS` before storing it.
  After redeployment, an invoice-shaped unsigned POST returned HTTP 400 `BAD_SIGNATURE`.
  Genuine signed invoice-created and invoice-paid events were received and processed after fixing PayPal's
  wrapped `resource.invoice.id` shape. Verification now also preserves original event JSON
  whitespace, escapes and number spelling. Forged signatures fail closed and create no inbox row.
  All reconciliation/admin paths reject anonymous, publishable-key and normal signed-in callers.
  The user's paid-event resend returned HTTP 200 at 02:20:31 on 1 November 2026 (Asia/Manila).
  Repeated provider GET reconciliation followed by this callback retained one paid-event row,
  one invoice, one unique payment transaction, USD 1.25 settled and zero pending.
- One Vault-backed minute reconciliation job is active. Three observed scheduled requests returned
  HTTP 200 without timeout/error. Anonymous and authenticated users cannot read decrypted Vault
  secrets or execute the service authorization/setup RPCs.
- The security advisor reports no database policy errors. It flags managed `pg_net` extension
  metadata in `public`; hosted metadata confirms `extrelocatable=false`. Do not force a catalog
  edit or drop the working scheduler extension; see [Supabase's pg_net guidance](https://supabase.com/docs/guides/database/extensions/pg_net).
  It also flags disabled leaked-password
  protection in hosted Auth. Review [Supabase's remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  and plan availability before public production rollout. Email confirmation remains enabled.
- A fixed 64-token synthetic OpenAI probe reached the provider but returned HTTP 429,
  `credit_balance_exhausted` / `insufficient_quota`. No live model output or quality evaluation
  has passed. Add API credits or replace the server secret with a funded API-project key.
- All required secret names are present; values and digests were withheld. The production npm
  dependency audit reports zero vulnerabilities. Retained synthetic evidence stays in ignored `.supabase/`.
- No PayPal Payouts or multi-seller onboarding is implemented or implied.

## Remaining release sequence

1. The single seller currently maps to the retained synthetic freelancer. Use that account/workspace
   for payment rehearsal; moving the merchant to a real teammate requires an explicit reviewed
   mapping change, not silently overwriting the paid test's history.
2. Inspect the existing Vault-backed retry schedule, pending webhook errors and function logs.
3. Fund the OpenAI API project, run synthetic live AI verification and the quality evaluation,
   then rehearse the complete two-user UI workflow on the protected preview.
4. Rehearse real email confirmation and the team-facing demo. Review Auth advisor warnings.
5. Review the pull request and approve the production environment/deployment as the final release step.
