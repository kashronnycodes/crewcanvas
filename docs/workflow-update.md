# CrewCanvas workflow update — November 9, 2026

Implemented on `codex/crewcanvas-workflow` for draft PR and Vercel Preview review.
This is a UI review branch, not a production release. The new API commands have
not been deployed. See the review instructions below.

## UI review instructions

Open the branch's Vercel Preview with `/?demo=1`, then select **Use this account:
Employer Demo**. No CrewCanvas credentials are needed for this labeled demo.
Vercel Authentication may still require a Vercel account with access to the
existing `crewcanvas` project; deployment protection stays enabled.

Explore Project studio, Project whiteboard and Revisions. Click a project,
role, member and task, then use Back. Try Add task from a member and from the
workspace. Use Viewing as to inspect the freelancer demo. Data is local to each
reviewer's browser; AI and payments are simulated. Parent-task creation and
counteroffers work in this local simulation; their authenticated API commands
require a future coordinated backend release. Do not use this preview to verify
new backend commands or real provider payments.

The branch now merges `origin/main` at `973205a291d7c777dc55289e4eebbf004adddc34`.
Main's reference-aligned Studio, compact role overview, editable whiteboard,
role roster, draft duplication, delivery preview, revision composer and rate-limit
fixes remain the baseline. The workflow changes are integrated into that UI.
Publishing this branch does not deploy Supabase functions or run migrations.
See [main integration verification](main-integration.md) for the new checks.

## Changes

- Navigation now contains **Project studio**, **Project whiteboard** and **Revisions**. The separate Work map screen is no longer mounted. Both project views derive their hierarchy from the same saved, authorized workspace snapshot: **Project → Role → Member → Tasks**.
- Existing assignments retain their IDs, terms, deliveries, revision history, invoices and permissions. Main's saved board projects and project roles remain canonical through `organization.collectionId` / `roleId`. Earlier branch assignments with `parentProjectId` are mapped into compatible collections without changing their saved ledgers. Additional tasks use the existing assignment records. No schema migration, data reset or invented acceptance record is needed. The API validates that the parent is a top-level project in the employer's workspace; each task keeps its own assignee authorization and financial ledger.
- Whiteboard cards are automatically spaced, with connectors only for parent/child relationships. Project, role, member and task cards open the same panels used by Studio. Zoom, pan, fit and fullscreen remain available. Existing saved drawing boards, notes, shapes, connectors, comments, file upload/version/preview tools, activity, and team/group organization are reachable through **Files & workspace tools**. Saved layouts are retained.
- Nested panels have Back controls and breadcrumbs. Browser Back traverses the same levels, including when a member or task is opened directly. Member scroll and workspace search are retained, and identical destinations do not add history entries. Dashboard shortcuts use the same navigation.
- **Add task** is available in Studio and Whiteboard. From a member, assignment and project context are fixed and Project/Role selectors are absent. The general form can select another eligible workspace member and project. Neither form has a separate Agreement section. Scope, price, deadline, included revisions and payment timing are proposed together. Main's **Draft** and **Proposed** task statuses remain available; proposed work starts after the assigned member accepts.
- Revisions lists members first, then their tasks, with project/role context, current task status, latest delivery, individual revision dispositions, fees and pending responder. A task opens the shared delivery preview, revision history and Add revision workflow.
- Paid revision proposals now support **Accept proposed price** and **Counteroffer** for the responding party. Counteroffers retain the previous proposals, author, amount and explanation. Only the other party can respond. Proposed amounts leave the total unchanged; acceptance adds only the accepted amount once. Existing stale-agreement and optimistic project-version protections remain.
- Task details show the base agreed price, accepted revision charges, paid amount, remaining balance, due date and next actor. Invoice/payment labels come from stored backend/provider state. A connected freelancer can issue an invoice only when the existing approval/allocation workflow permits it. Employer **Pay now** links require an actual payable Sandbox invoice, a provider ID and an HTTPS Sandbox PayPal URL. Pending/paid/cancelled/sample invoices cannot create a fake payment action. Redirects and approval never mark payment paid.
- Task badges use yellow for In progress, orange for Awaiting approval and green for Approved, with text labels and accessible light/dark shades. Counts derive from saved task status after mutations and refresh.

## Original workflow verification (before the main integration)

These results describe commit `d54a7f2`; current merge verification is recorded in
[main-integration.md](main-integration.md). Hosted integrations were not rerun as
part of this UI merge.

| Check | Result | Evidence boundary |
| --- | --- | --- |
| `npm test -- --reporter=dot` | **149 passed in 25 files** | Local UI/domain tests and real embedded PostgreSQL/PGlite execution; not hosted authentication |
| Desktop and mobile browser suite | **50 passed, 2 conditional skips** | Installed Microsoft Edge through Playwright, desktop and Pixel 5 emulation; browser-local demo data and simulated AI/payments |
| New workflow browser tests after final UI polish | **3 passed** | Assignment, Back, member-form cancellation, refresh/shared whiteboard, revision counteroffers/acceptance, payment breakdown and freelancer AI access |
| `npm run build` | **Passed** | TypeScript and Vite production bundle |
| `npm run check:server` | **Passed** | All three Edge Functions checked: crew API, PayPal webhook and reconciliation |
| `npm run test:paypal-config` | **Passed** | Authenticated synthetic employer/worker sessions; employer-only access and actual PayPal Sandbox OAuth credentials |
| `npm run test:endpoint-security` | **8 groups passed** | Hosted backend rejects public/app access to service routes and rejects malformed, unsigned and forged webhook events; forged signature checked through PayPal |
| Workspace AI summary | **Passed** | Actual authenticated `ai/workspace` call using the existing isolated synthetic fixture workspace |
| Full `npm run test:ai` | **Incomplete** | Provider timeout at `ai/brief`; the later independent workspace-summary call succeeded |
| Existing Sandbox payment snapshot | **Read successfully** | Authenticated backend record: work accepted, invoice paid, amount 125 cents, paid 125 cents, pending 0. This was a backend read, not a newly authorized payment or a fresh manual provider reconciliation |

Focused regression coverage includes browser-history deduplication and scroll restoration; member assignment and pending acceptance; shared project grouping; persisted parent metadata and PostgreSQL peer isolation; two-way counteroffers, self/peer/stale/superseded rejection and idempotent acceptance; exact payment totals and safe payable invoice links. Existing delivery, file-version, immutable agreement, RLS and provider normalization tests also pass. Browser lifecycle checks verify the yellow/orange/green backgrounds through progress, submission, approval and refresh. Browser checks found and fixed a zero-width flex whiteboard and task-tab scroll hiding the payment summary.

Reproduce the browser run on this Windows machine:

```powershell
$env:CREW_BROWSER_CHANNEL='msedge'
npm run test:e2e -- --project=chromium --project='Mobile Chrome'
```

The two skips are the desktop-only saved-group check on mobile and the mobile-only overflow check on desktop. Mobile Safari/WebKit was not run. The default downloaded Chromium browser is absent, so this verification used installed Edge rather than installing new browsers.

## Remaining external gates

The new parent-task and counteroffer command contracts are implemented in the local crew API source. The deployed API has not been updated, as requested. Full authenticated multi-user verification of these **new commands** must follow a future coordinated frontend/API release; the live checks above verify retained integrations only. The full AI suite still needs a successful brief-extraction run after the provider timeout. No provider invoice, payment, seller connection, migration or production configuration was created or changed.

## Screenshots

All screenshots show labeled local demo data, not authenticated provider settlement.

- [Project studio](screenshots/project-studio.png)
- [Interactive shared project whiteboard](screenshots/project-whiteboard.png)
- [Member-specific task form](screenshots/member-task-form.png)
- [Revisions grouped by member and task](screenshots/revisions.png)
- [Task payment responsibilities](screenshots/task-payments.png)
- [Dark mode and status colors](screenshots/studio-dark.png)
