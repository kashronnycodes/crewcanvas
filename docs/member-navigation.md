# Task and member navigation

Owners use **Project Studio** for creation, assignment, proposed terms, editing, task monitoring and approval. Regular members start in **My Tasks**, ordered by saved due date, with missing dates last and stable ordering for ties. Authentication and workspace membership identify the member; names and avatars never grant task access.

**Project Whiteboard** retains existing task-scoped board objects, file objects, drawings, notes, pan/zoom and fullscreen. Its task selector chooses the existing annotation scope. It does not expose task creation, assignment or task-detail editing. Files & team no longer embeds another board.

Clicking a member opens a compact dialog containing only their name and project role. It does not open a task list, task picker, payment history or task page. Opening an actual task from Project Studio or My Tasks retains the existing unified scrolling task page and all permitted workflow actions.

Back navigation returns to visited screens only; opening a task does not manufacture member/role navigation levels. Notifications return to Project Studio or My Tasks before opening the authorized task. Pending/active terms remain distinct, and editing uses the existing accepted/proposed agreement workflow rather than overwriting accepted history.

## Permissions and data

The legacy roster/summaries endpoint is owner-only and returns HTTP 403 to regular members before privileged roster queries run. Existing full snapshots still filter regular members by authenticated workspace membership and assignee ID. Direct task commands, file access, private storage and database RLS keep their existing checks. The frontend also filters My Tasks, whiteboard scopes and explicit task destinations by the authenticated membership ID, so forged client navigation never falls back to another member's first task.

No migration or stored task/board rewrite is needed. Existing assignments, files, revisions, invitations, permissions and PayPal records are preserved. Judge/team access continues using the existing backend-validated code and real Auth sessions.

## Verification

- 234 unit/database checks passed, including the real Edge-handler denial for regular-member summary requests and membership-based task filtering.
- 29 desktop browser checks passed, including task creation, assignment changes, updated agreements, acceptance, private file submission, approval confirmation/cancel, persistence, member information, direct forged destinations, reference images, reassignment restrictions, board copy/paste, fullscreen and resizing.
- Two focused mobile navigation checks passed.
- Production build and Edge type checks passed.
- The live API workflow uses existing dedicated CrewCanvas Judging identities and one identifiable USD 0 task. It verifies unassigned-task privacy, assignment, agreement history, file persistence, acceptance/approval, direct peer REST/API denial and preservation of existing records. No invoice or payment is created.

Run `npm test`, `npm run build`, and `npm run check:server`. Browser tests use `npx playwright test --project=chromium`; Windows can set CREW_BROWSER_CHANNEL to the installed Edge channel. Authorized operators with existing private local judging fixtures can run `node scripts/verify-member-navigation.mjs`. Credentials, access codes, browser sessions and live verification screenshots stay in ignored local paths.
