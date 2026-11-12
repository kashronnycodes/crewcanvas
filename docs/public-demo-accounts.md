# Public hackathon demo accounts

## Decision and architecture

The live `https://crewcanvas.vercel.app/` bundle was inspected on November 7, 2026 (Manila). It runs **integrated** mode. Its existing Supabase project is not demonstrated to be isolated from team/business accounts. Public credentials are therefore **not published or provisioned on that project**. This implements the explicitly requested safe fallback.

The existing AccountGate, rather than the older unreachable Login component in App.tsx, owns the deployed sign-in form. Beneath it, Explore CrewCanvas offers Employer Demo, Freelancer Demo 1 and Freelancer Demo 2. Each opens `/?demo=1&account=...`, consumes the account choice, and stores a tab-scoped simulated identity. Refresh restores it; sign out clears it. Existing Supabase sessions remain separate. No Supabase client is created in simulation, even when the build is integrated.

Simulation uses existing domain commands, project forms, revisions, agreements, files, payment status and whiteboards. The compact synthetic studio has one employer, two freelancers, three projects, accepted/proposed agreements, an openable text deliverable, a revision, a pending $20 extra-work proposal and a partial sample payment. Freelancer 2 cannot see Freelancer 1's assigned projects through the simulated repository. This is a workflow demonstration, **not backend authentication or a security boundary**. Browser developers can edit their own local data.

Storage uses `crewcanvas.public-demo.v1`, a distinct UUID namespace, a tab-scoped actor, and `crewcanvas.public-demo.board.<projectId>` keys. Reset affects this local dataset and its boards only. People sharing a browser profile share the demo workspace; separate browser profiles avoid collisions. Separate browsers do not collaborate live. AI and payments are explicitly simulated. The legacy development demo and all integrated permissions remain available.

## Optional real account provisioning

`npm run provision:demo -- --check` performs a read-only target/inventory check; `npm run provision:demo` provisions actual distinct Supabase Auth users and backend memberships. **These commands were not run against a dedicated cloud project, because one has not been supplied.** The current shared project is hard-denied. The command is operator-only; do not expose it as an endpoint.

1. Create a new Supabase project exclusively for disposable synthetic demos. Apply the repository's existing migrations in order using a separately configured CLI/profile. Do not use `scripts/supabase.ps1`, which intentionally targets the existing shared project.
2. Set these server-side environment variables in the operator shell:

| Variable | Value |
| --- | --- |
| `CREW_DEMO_PROJECT_REF` | New dedicated project's 20-letter reference |
| `CREW_DEMO_SUPABASE_URL` | Exact `https://<reference>.supabase.co` URL |
| `CREW_DEMO_SERVICE_ROLE_KEY` | Dedicated project's server-only service key |
| `CREW_DEMO_ISOLATION` | `synthetic-only` |
| `PAYPAL_ENVIRONMENT` | `sandbox` |
| `CREW_DEMO_PASSWORD` | Disposable password, at least 16 characters |
| `CREW_DEMO_GENERATION` | Positive integer, default `1` |

3. Run the check, then provision. Setup paginates the full Auth/workspace/membership inventory and refuses unrelated data. Only server-controlled app_metadata marks demo Auth users. Existing credentials and project history are preserved. Repeating a run completes interrupted work without duplicating accounts/projects or resetting accepted history. Run one operator setup process at a time.
4. Emails are `crewcanvas.public-demo.g1.employer@example.com`, `crewcanvas.public-demo.g1.freelancer-1@example.com`, and `crewcanvas.public-demo.g1.freelancer-2@example.com`. Use the supplied disposable password through normal Supabase sign-in. A rerun does not rotate existing passwords.
5. To restore a clean backend demo, choose a **new generation** and rerun. This creates a fresh workspace and three new users, retaining immutable historical records. Old generations remain until the dedicated project is retired. Never reset by deleting shared workspaces or disabling immutable-record triggers.

Do not publish any password unless a separate security review has confirmed isolation of Auth, database, storage and integrations. The shipped public UI intentionally continues offering simulation; it never reads credentials from VITE variables. A dedicated integrated deployment can use the operator-provisioned accounts through its normal form. Backend public credential cards are deferred until isolation is established.

## Deploy and verify

Deploy this branch only after review; nothing is merged or deployed automatically. Keep the current frontend environment (`VITE_APP_MODE=integrated`, the existing Supabase URL and publishable key) to preserve authenticated work. The local fallback needs **no new frontend environment variables and no new migrations or function deployment**. Vercel's existing SPA routing serves `/?demo=1`. A new integrated demo host needs its own Supabase URL/key and exact CORS origin, existing Edge Functions and migrations. Never configure live PayPal. Do not attach production AI/provider credentials to a public test backend.

Playwright includes PR #5's three existing suites without its unrelated .env deletion, gitlink or lockfile churn. The file-storage ArrayBuffer fix from that PR is retained for WebKit compatibility. The new public-demo suite runs separately from opt-in real backend tests. Invalid credentials in the simulated suite are tested by explicitly mocking the Auth response; this is not evidence of a real backend login.

Commands: `npm run build`, `npm test`, `npm run test:e2e`, `npm run test:e2e:integrated`, `npm run test:endpoint-security`, `npm run test:paypal-config`, `npm run test:paypal-flow -- --verify`. For real browser auth tests set `CREW_E2E_BASE_URL` to the dedicated deployment and supply the operator password/generation. Never put passwords in reports or command arguments. See the accompanying verification results for what actually ran.

## Files changed

UI/session: `src/App.tsx`, `src/components/AccountGate.tsx`, new `src/components/DemoAccounts.tsx`, `src/components/DemoGate.tsx`, `src/demoSession.ts`, and `src/redesign.css`.

Fixtures/services: new `shared/publicDemo.ts`, plus `src/services.ts`, `src/fileService.ts` and `src/boardService.ts`.

Operator setup: new `scripts/demo-safety.mjs` and `scripts/provision-demo.mjs`; commands in `package.json`.

Tests: new `tests/publicDemo.test.ts`, `playwright.config.ts`, `playwright.integrated.config.ts`, `e2e/public-demo.spec.ts`, `e2e/integrated/demo-auth.spec.ts`, and the three restored PR #5 suites (`e2e/smoke.spec.ts`, `e2e/workspace.spec.ts`, `e2e/extended-workflows.spec.ts`). Handoff: `README.md`, this document and `docs/public-demo-verification.md`.
