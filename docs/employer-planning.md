# Employer planning and team setup

The workspace chooser no longer renders the expanded workspace/team settings block. Workspace menu → Settings edits the saved workspace name and timezone in a focused dialog. Files & team shows a member list, one Add member action, per-member Edit menus, and a separate Invite account action. Existing visual group tools remain available in a collapsed section.

Manual members require a deliberate, valid submission. Opening, closing or cancelling a form writes nothing. The backend serializes member creation per workspace, rejects duplicate emails case-insensitively and uses a stable request ID for safe retries. Existing manual profiles can be claimed only through the normal verified-email invitation acceptance flow, retaining their member ID and assignments. No Auth user is created by adding a member.

## Sample profiles

`scripts/seed-employer-samples.mjs` is an explicit operator action targeting only the existing **CrewCanvas Judging** workspace (`0214b9d3-1b98-4ce0-8abe-94b3a1ef4b28`). It validates the project identity, workspace name and owner before using the backend's service-only sample setup RPC. It creates Jamie Chen, Riley Santos and Casey Morgan with `sample: true`, a stable sample key, no email and no Auth identity. Running it again reuses existing sample records and preserves edits.

The app never runs this script on startup, sign-in or workspace creation. Ordinary workspaces receive no samples. Database constraints prevent sample profiles from carrying an Auth identity. Sample profiles appear in the normal roster and assignment pickers with a Sample label, can be added to project roles and assigned planning tasks, and have no ability to sign in or read private work. They have no invite-delivery or acceptance status. Connecting a sample identity directly to an account is not supported; actual teammate access uses the separate authenticated invitation flow.

New board projects start with no predefined roles. Existing roles, members, project organization, invitations, permissions and workspace settings are preserved.

## Optional assignment

The shared task contract and database now permit an explicit `null` assignee. General task forms start at Unassigned, even when members exist. Member-specific task forms preselect that member and permit clearing the selection. Changing a project or role never silently picks its first member.

Unassigned tasks remain visible in the project's task list and both board map modes. Task details have an explicit assignment picker and Save assignment action supporting assignment, change and clearing. Sample and unassigned tasks remain planning drafts; no acceptance is fabricated. The API validates an assignee's workspace and worker membership, and only the employer can change assignment.

Existing RLS continues to restrict task data, board objects, files and comments to the employer and the actual assigned account. Null assignments grant no freelancer access. The database commit function uses null-safe authorization comparisons so an unassigned row cannot bypass worker restrictions. Version checks, idempotency and existing ledger persistence remain in place.

To preserve contracts and payments, tasks with accepted terms, delivery/revision history or invoices retain their original assignee. Their UI explains that different work needs a new task. Planning tasks support the full assign/change/clear workflow.

## Verification and rollout

- 220 unit/database tests in 33 files, 23 desktop browser tests and 3 mobile Chromium checks passed. Production build and Deno checks passed.
- Unit/domain/API tests cover optional assignees, owner-only assignment, input validation and payment-history protection.
- PostgreSQL tests apply all migrations to PGlite, verify real persistence across reads, assign/change/clear, idempotent sample setup, sample identity constraints, invitation claim identity preservation and actual RLS denial.
- Browser tests exercise the normal authenticated frontend/API path with HTTP test doubles: member add/edit/cancel, duplicate rejection, settings, refresh, unassigned tasks, sample assignment changes, member-specific clearing, private worker views and existing fullscreen/AI/payment flows.
- Original browser regression images use synthetic HTTP test data. The `member-list-live.png`, `task-form-live.png` and `assignment-live.png` images show the local frontend connected to the deployed real backend, using normal judge-account sign-in.

The user explicitly approved the backend update and sample creation. On **November 12, 2026 (Asia/Manila)**, both migrations were applied to the verified CrewCanvas Supabase project and `crew-api`, `paypal-webhook` and `reconcile` were deployed. The bounded judging-workspace sample setup ran twice and retained exactly three sample profiles, all without Auth identities.

Real authenticated API verification saved and reloaded an unassigned planning task, assigned it to Jamie Chen, changed it to Riley Santos and cleared it again. Database columns and JSON stayed consistent. Freelancer reads and management writes were rejected. Existing judging tasks and assignments remained unchanged. Manual add/edit persistence, blank/duplicate rejection and creation of a real invitation link were verified in the separate existing QA workspace; that workspace received no samples. The isolated planning verification task remains Unassigned, with no accepted terms or payment activity.

A real browser then signed in through Continue as Client, displayed the saved profiles and sample picker options, checked the Unassigned default, cancelled a filled task form without any mutation request, changed and cleared the isolated task assignment, and refreshed to confirm Unassigned persisted. No browser page errors occurred. Evidence is recorded in `live-verification.json` and `live-browser-verification.json`.

The post-deployment security advisor reports two existing platform configuration warnings: `pg_net` is installed in `public`, and leaked-password protection is disabled. This change does not alter those settings. No new function/RLS advisory was reported.

The updated frontend remains available at http://127.0.0.1:5173/ against the deployed backend. The public hosted frontend has **not** been republished as part of this backend approval.
