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
| Database | Existing relational/JSON contracts retained; four migrations applied | Future schema changes follow reviewed migrations |
| Auth | Signup, confirmation redirect, password sign-in, persisted sessions, sign-out, membership-based roles | Real inbox delivery and a user's signup confirmation still need a manual rehearsal |
| Workspaces | Creation, list/selection, persistent layout, settings; one account can have several memberships | Workspace deletion and member removal are intentionally not exposed |
| Team | Seven-day email-bound invitations, existing/new accounts, member name/creative-role editing | Invitation links are manually shared; no custom email sender |
| Work | Assigned project agreements, included tasks, delivery/revision/approval cycle | Task cards represent project-level agreed work; independent per-line-item assignees/statuses are not implemented |
| Files | Private bucket, server-authorized uploads, immutable version history, signed downloads | Large/resumable uploads, virus scanning and Office previews remain out of scope |
| Activity | Durable project/file/workspace events; recipient-specific unread/read notifications | Fifteen-second polling is used; no Realtime subscription is required |
| PayPal | Sandbox-only invoicing adapter, normalized settlement, idempotent verified webhook inbox, transaction records | REST seller credentials, seller membership mapping, real payment/signature round trip, retry schedule |
| AI | Real server-side Responses integration, brief/scope analysis and contextual summaries; bounded authorized context and validated IDs | `OPENAI_API_KEY`, model access, live evaluation and output-quality checks |
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
| `reconcile` | Retry durable webhook events and refresh bounded invoice records | Server service key on `apikey`; never a browser key |

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
| Owner seller-setup shell only | `CREW_SELLER_MEMBERSHIP_ID`, `PAYPAL_MERCHANT_ID`, `PAYPAL_SELLER_EMAIL` |
| Retry scheduler / Vault | `crewcanvas_project_url`, `crewcanvas_service_key`; see `docs/schedule.sql` |

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

## Verification and limitations

- 66 regression tests pass across 14 files, including executing the full migration chain in PostgreSQL,
  worker/peer isolation, direct-write denial, invitation identity/replay handling, timestamps,
  immutable file evidence, notifications, signup UI and persisted workspace selection.
- Production frontend build and all three server entry-point type checks pass.
- Thirteen live integration checks passed with three distinct real Supabase accounts. They cover
  sign-in, anonymous denial, idempotent workspace creation, invitation acceptance, assignment,
  bilateral agreement, cross-workspace API/RLS denial, role-escalation denial, saved canvas positions,
  actual private upload/signed download, two file versions, requested revision, revised submission,
  employer approval, notification read persistence, protected evidence and sign-out.
  Employer-only workspace settings and creative-role label editing were also verified without role escalation.
- The live workflow reloads database snapshots throughout; it is an API/storage integration test,
  not an authenticated browser end-to-end test. The integrated sign-in page was visually checked.
  Full authenticated browser rehearsal and real confirmation-email delivery remain manual gates.
- The security advisor reports no database policy errors. It does flag disabled leaked-password
  protection in hosted Auth. Review [Supabase's remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  and plan availability before public production rollout. Email confirmation remains enabled.
- Real OpenAI responses, a real PayPal Sandbox invoice/payment, signature verification round trip,
  and the configured retry scheduler have **not** been verified without the provider secrets.
- No PayPal Payouts or multi-seller onboarding is implemented or implied.

## Remaining release sequence

1. Add the provider secrets securely and choose the actual freelancer membership for the single seller.
   Run `npm run configure:seller` in the owner's isolated shell after setting its three metadata variables.
2. Register `https://tsnwowlyrlxpwwetmxns.supabase.co/functions/v1/paypal-webhook` in the matching Sandbox
   REST app for the Invoicing events listed in README. Use a separate personal Sandbox payer.
3. Configure the Vault-backed retry schedule once; inspect pending webhook errors and function logs.
4. Run the live AI evaluation and rehearse the complete two-user UI workflow on the protected preview.
5. Create and pay a genuine new Sandbox invoice. Verify signed webhook receipt and GET invoice settlement;
   retry/deliver duplicates and confirm no duplicate billing or financial records.
6. Review the pull request and approve the production environment/deployment as the final release step.
