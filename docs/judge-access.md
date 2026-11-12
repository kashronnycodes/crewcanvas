# Judge/team access

Live judging build: https://crewcanvas.vercel.app

The existing sign-in/sign-up screen has one Judge/team access section with Employer and Freelancer options and a private code field. These authenticate the two existing payment-test identities into Updated integration studio 1793461807178. No accounts, memberships, sellers or invoices are recreated. Earlier judging accounts and their records remain intact.

## Authentication and configuration

The public `judge-team-access` Edge function validates a strict role/code request. It rejects additional email/user-ID fields, rate-limits every attempt atomically, checks the backend code digest, verifies the fixed Auth identity and workspace membership, then verifies a server-generated magic link through normal Supabase Auth. Only normal session tokens return over HTTPS in a non-cacheable response; no magic link, code digest, admin credential or provider secret is exposed. The browser uses the regular SDK session persistence and existing API/RLS permission checks.

Backend configuration names (values must remain private):

- `JUDGE_TEAM_ACCESS_ENABLED`
- `JUDGE_TEAM_ACCESS_CODE_SHA256`
- `JUDGE_TEAM_EMPLOYER_AUTH_ID`
- `JUDGE_TEAM_FREELANCER_AUTH_ID`

The endpoint uses the platform's existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY`, plus the existing allowed-origin configuration. Browser configuration remains limited to the Supabase URL and publishable key. The former browser password configuration has been removed. Missing/disabled configuration fails closed. Admission allows six attempts per network fingerprint per minute, with a global cap of forty; identifiers are hashed with a private pepper. Admission tables and RPC execution are service-only.

The operator script `scripts/configure-judge-team-access.mjs` verifies the fixed existing identities, membership roles, connected Sandbox seller and successful USD 5.00 invoice before preparing configuration. It saves the random private code and rehearsal guide in ignored local files. It never resets accounts or remaps a merchant. Apply the admission migration and deploy the function before enabling access. Use `--set-secrets` only for an authorized backend release; `--verify` compares preserved records, allowing ordinary background provider sync timestamps and aggregate versions to advance.

Disable new judge sign-ins using the backend enable flag. Existing authenticated sessions continue under normal Auth expiry and permissions; disabling entry is not global session revocation. Rotate the code through the private local operator configuration and replace its server digest. Do not publish the code, login links, tokens, auth storage or browser traces.

## Rehearsal workflow

Use separate browser profiles or isolated browser contexts for Employer and Freelancer. Ordinary windows in one profile share local-storage sessions. Enter the private code locally and choose the role; the connected workspace opens automatically. Each rehearsal must use a new task titled with a date/time and initials, because these accounts share saved data.

Create task → freelancer accepts terms → upload and submit a file → employer previews and confirms approval → freelancer issues invoice → employer manually pays in PayPal Sandbox → return and verify the real invoice becomes Paid. Approval and payment are separate states. Request revision for changes, then submit a new version for review.

PayPal checkout requires the separate **Personal Sandbox buyer** supplied privately by the organizer. CrewCanvas logins are not PayPal buyer credentials. Never include the buyer password in the public UI, repository, screenshots or recordings. The existing connected Business Sandbox seller, merchant mapping, paid invoices and successful USD 5.00 payment are preserved. No new payment was automatically authorized during this release.

## Verified release

- Both deployed entry points authenticate the correct fixed identity and workspace.
- Both normal sessions survive refresh; signing out one isolated context leaves the other signed in.
- Normal email/password sign-in works. The existing hosted invite-only registration policy is unchanged; the registration form is covered by unit tests.
- Invalid codes and arbitrary identity fields are rejected, with deployed rate limiting and Retry-After verified.
- Freelancer snapshots retain only their assigned tasks. The legacy member task-summary endpoint is restricted to owners; regular members receive HTTP 403. Member clicks show basic profile information, not task lists.
- Connected seller and stored payment amounts/statuses match the private pre-release baseline; scheduled reconciliation metadata advances normally.
- 233 unit/database tests, 28 desktop browser regressions, production build and Edge type checks pass. Live private reference-storage checks also pass.

[Live browser checks](evidence/judge-team-access/verification.json) · [Sign-in screenshot](evidence/judge-team-access/sign-in.png)
