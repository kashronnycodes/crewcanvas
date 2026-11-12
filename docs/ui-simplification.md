# CrewCanvas UI simplification — 11 November 2026

Implemented in the existing `crewcanvas` checkout. No deployment was performed.

The supplied attachment contained the request text only. No reference screenshot was accessible, so visual work follows the written brief; no image-match claim is made.

## What changed

- Replaced the busy global shell with app identity, actual workspace switching, account controls, one active page, and a workspace menu for invitations/settings/help/sign-out.
- Kept Work map, Whiteboard, Task list, Revisions, files, AI, task details, member/group management, notifications, onboarding, agreements, revisions, and payments on their existing workflows.
- Removed promotional headings, demo sign-in/account shortcuts, role impersonation, simulation notices, duplicated summary strips/counts, decorative footer branding, and the redundant roles hub. Project cards now connect directly to their roles.
- Every account uses Supabase authentication, database records, private file storage, collaboration, and configured AI. URL/build demo flags cannot enable browser-only records or simulated success. Missing services show honest errors.
- Removed simulated invoice/payment commands from production validation and domain execution. The previous deterministic adapters and payment mutations are test-only fixtures.
- Every board initializes in Pan, including empty/new boards and boards reopened through navigation. Select remains explicit, object dragging follows the actual tool state, and card buttons remain usable in Pan. Drawing, shapes, connectors, links, files, undo/redo, zoom, fit and fullscreen remain available.
- Preserved project → role → member → task navigation with Back. Member task forms keep their assignee; the general form still supports other assignments.
- Unified spacing, cards, thin borders, restrained light/dark colors, focus states, accessible labels, task-tab keyboard navigation, and plain copy. Mobile keeps the workspace switcher and wraps board tools; initial mobile map zoom keeps cards readable.

No accounts or existing backend records were deleted. No schema migration, auth-policy change, permission relaxation, PayPal environment change, or payment-provider configuration change was made. Previous browser-only simulation data is left intact in its old keys and is no longer used as application data; it was not silently imported into live workspaces. Theme, workspace selection, auth sessions, and unsaved recovery drafts retain appropriate browser storage.

## Verification

| Check | Result |
| --- | --- |
| Existing unit/database suite plus new regressions | 195 passed across 31 files |
| Desktop and mobile Chromium browser regressions | 22 passed |
| TypeScript and Vite production build | Passed |
| All three Supabase Edge Function type checks | Passed |
| Real auth and authorized workspace records | Passed |
| Real task/role/member creation and accepted terms | Passed |
| Real private file upload, signed download, submission, revision, resubmission and approval | Passed |
| Real board persistence, separate freelancer session, comments and resolution | Passed |
| Refresh persistence and fresh authenticated session | Passed |
| Freelancer member-edit restriction | Denied as expected |
| Configured AI workspace answer | Real response received |
| Existing PayPal configuration check | Sandbox, credentials valid |
| Desktop, 390px mobile, 768px tablet, light/dark screenshots | Captured and inspected; no page errors or horizontal overflow |
| Mouse pan, CDP touch pan, trackpad zoom, empty-board defaults, nested Back, member assignment, keyboard focus | Passed |

Real checks used the existing synthetic integration accounts and a separate **CrewCanvas QA · Launch team** workspace. The QA records are retained. [Machine-readable results](evidence/simplification/live-verification.json) distinguish actual backend checks from the browser suite's explicitly intercepted HTTP test responses.

The obsolete browser-simulator E2E specs were replaced by authenticated-entry, service, hierarchy, tool, persistence, permission, and error regressions. Existing domain, database, file delivery, navigation, payment, webhook, AI and rate-limit tests remain. Browser test fixtures are confined to `e2e/` and `tests/`.

Commands:

```powershell
npm test
npm run build
npm run check:server
npx playwright test --project=chromium --project="Mobile Chrome"
```

On this Windows host, browser runs used `CREW_BROWSER_CHANNEL=msedge` and `PLAYWRIGHT_BROWSERS_PATH=.supabase/playwright-browsers`. Unit tests needed `TEMP` and `TMP` pointed to the writable workspace cache because the sandbox's default cache rename was denied. Deno server checks passed with the required network/process access; the restricted sandbox could not fetch its package cache.

## Screenshots

- [Work map, desktop](evidence/simplification/work-map-desktop.png)
- [Whiteboard, desktop](evidence/simplification/whiteboard-desktop.png)
- [Whiteboard, mobile](evidence/simplification/whiteboard-390.png)
- [Whiteboard, tablet](evidence/simplification/whiteboard-768.png)
- [Whiteboard, dark](evidence/simplification/whiteboard-dark.png)
- [Task list](evidence/simplification/tasks-desktop.png)
- [Revisions](evidence/simplification/revisions-desktop.png)
- [Member-specific task form](evidence/simplification/member-task-form.png)
- [Files and review](evidence/simplification/files-and-revisions.png)
- [Revision details](evidence/simplification/revision-details.png)
- [Payments](evidence/simplification/payments.png)
- [Real AI response](evidence/simplification/ai-desktop.png)
- [Sign-in](evidence/simplification/sign-in.png)

## Limits

- WebKit failed to launch on this Windows host (exit code 3236495362), so Safari could not be verified. The default all-project browser command still includes Safari for a compatible host.
- PayPal Sandbox credentials and existing payment safeguards/tests were checked. No new invoice, checkout, settlement, or live-money transaction was performed.
- Chromium touch emulation and trackpad-style wheel input were tested; physical phone and trackpad hardware were not available.
- Source changes and screenshots are local. The hosted frontend/backend were not redeployed.


## Follow-up: judge access — 12 November 2026

At the user's request, real Client, Freelancer 1, and Freelancer 2 account buttons were restored below the sign-in form. They use password authentication and the existing backend. They do not restore the browser simulator. See [judge access](judge-access.md) for provisioning and verification.
