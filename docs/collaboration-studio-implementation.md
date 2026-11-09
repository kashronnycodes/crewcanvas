# CrewCanvas collaboration studio

Implementation date: November 8, 2026 (Asia/Manila). Local branch: `codex/collaboration-workflow`, based on released commit `19fb8848be7548a9615cbc03fa663f5fc9075292`. Changes are local and have not been deployed or pushed.

The [verification manifest](evidence/workflow-studio/manifest.json) records command outcomes and SHA-256 hashes of the 29 changed/new source and test files. Earlier backend audit documents remain separate, unmodified worktree files.

This report records the initial implementation and its checks. Both reference images were subsequently supplied and applied in the [reference alignment update](reference-alignment.md), which includes the current screenshots and verification results.

## What changed

- **Project studio:** a default project → role → member → task graph, consistent card spacing and attached connectors. Custom roles, roster panels, avatars, member task lists, contextual task creation, draft duplication, Fit to content and Reset layout are available. On mobile, role buttons open the same roster without requiring precision taps on a zoomed-out diagram. Existing Work map, project list, AI tools and project whiteboards remain available.
- **Task creation:** project, role, assignee, title, description, date and draft/proposed status. Optional planning/AI and agreement options are collapsed in the task form. Member-view creation preselects that member. Task state continues through the existing server-enforced agreement, delivery and review lifecycle.
- **Whiteboard editing:** select/pan, tasks, notes, text, shape and line popovers, connectors, drawing/eraser, uploads and links. Annotation selection, resizing/styling, floating actions, context menus, copy/paste, duplication, grouping, alignment, layering, locking and undo/redo use saved board records. Keyboard actions ignore editable controls. Pointer movement is committed at gesture completion, rather than saving each movement.
- **Deliverables:** image/video/PDF previews reuse private file access and exact delivery versions. Drive/Docs embeds use an explicit provider allowlist. Other HTTPS links retain an Open original fallback. Add to whiteboard creates a version-linked preview, a task reference and a connector.
- **Revisions:** a dedicated queue, prominent + Add revision action, delivery preview, separate history entries with requester/version/date, optional due date, included/free requests and USD fee proposals. Clients can offer an amount; freelancers can accept or counter, and either side can respond to the other's counteroffer. An accepted fee creates a new agreement version without altering accepted originals or marking any invoice paid.
- **Theme:** shared light/dark tokens cover form fields, placeholders, focus states, menus, dialogs, contextual panels and preview states. User-selected note colors remain separate from the interface theme.

## Persistence and permissions

Board projects and role rosters are organization metadata in the existing versioned `canvas_layouts` record. Each assigned task reuses an existing `Project` contract record, with an optional collection/role reference. This preserves the original per-task agreement, private files, delivery review, revisions and invoicing boundaries; existing records are not converted or reset.

Only an authenticated employer can save organization metadata or create an assignment. The command handler checks the requested role and assigned member against the current workspace layout; the database independently requires a worker membership in that workspace. A role label does not grant employer rights or access to a peer's tasks. Freelancer snapshots filter unrelated collection titles, roles and peer membership IDs. Existing project access checks, board/file RLS and private storage permissions remain in effect.

Annotations use the existing version checks, conflict recovery, Realtime subscription and reconnect polling. A collaborator's newer object version is not silently overwritten. Duplicating a task copies editable draft content into a new identity, never invoices, accepted agreement identities, approvals, deliveries or revision history. Offer acceptance requires the opposite party, and only an offer's author can rebase it.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Vitest, including local PostgreSQL/PGlite security and persistence suites | 175 tests passed in 28 files; exit 0 | [Log](evidence/workflow-studio/vitest.log) |
| Complete Playwright regression | 79 passed, 5 existing platform-specific skips; exit 0 | [Log](evidence/workflow-studio/playwright.log) |
| New studio workflow cases | 9 passed across desktop Chromium, mobile Chromium and mobile WebKit | [Log](evidence/workflow-studio/studio-browser.log) |
| TypeScript/Vite production build | Passed; exit 0 | [Log](evidence/workflow-studio/build.log) |
| Deno server checks | All three Edge entrypoints passed; exit 0 | [Log](evidence/workflow-studio/server-check.log) |

The browser scenario creates one project, three initial roles and two synthetic members, then exercises custom roles, tasks, draft duplication and refresh. Annotation checks cover text-editing shortcut isolation, persistence, drawing, shapes, links, grouping, alignment, locks, uploads and undo/redo. Revision checks add two requests, negotiate a client offer through a freelancer counteroffer, approve the resulting fee, refresh, and compare the original invoice arrays unchanged.

SQL tests execute the new board validation function in a local database, verify optional presentation metadata survives reads by both authorized identities, and reject foreign task references, invalid file versions and peer access. Existing payment normalization, webhook verification, idempotency, rate-limiter, authentication and immutable-agreement regression tests are included in Vitest. The five browser skips are the existing desktop-only group tests on mobile and the mobile-only overflow check on desktop.

Initial browser runs identified duplicate delivery headings, legacy map tests relying on the old start view, overlapping mobile controls and canvas bounds hidden under the task header. These were corrected and retested. Browser fixtures run locally; provider preview HTML is synthetic. These checks do not claim a live PayPal settlement or hosted two-account Realtime test of the new build.

Verified screenshots: [desktop light](evidence/workflow-studio/studio-desktop-light.png), [desktop dark](evidence/workflow-studio/studio-desktop-dark.png), [mobile dark](evidence/workflow-studio/studio-mobile-dark.png), [mobile revision panel](evidence/workflow-studio/revision-mobile-dark.png).

## Deployment prerequisites — not performed

The additive migration [20261107180709_collaboration_board_metadata.sql](../supabase/migrations/20261107180709_collaboration_board_metadata.sql) extends the private board validation function for optional lock/group/task/file-version metadata. It preserves existing identity/version checks, validation, project/file scoping, RLS and grants. It does not change financial records or authentication permissions. The migration was tested locally and applied to the existing CrewCanvas Supabase project as version `20261107180709` before deploying `crew-api` version 28. Deployment verification is recorded separately.

A separately authorized release must review/apply this migration to the existing CrewCanvas project `tsnwowlyrlxpwwetmxns`, deploy the updated `crew-api`, then release the frontend. New layout/command schemas require that updated API. This feature does not require deploying `paypal-webhook` or `reconcile`. Perform hosted two-account collaboration, preview access and non-mutating Sandbox reconciliation gates before a production release. No other Supabase project is involved.

## Limits

- Current visual direction and interaction refinements are documented in the [reference alignment update](reference-alignment.md).
- Hosted end-to-end verification of these new schemas and Realtime behavior is pending the separate deployment process. Local SQL identities and simulated browser accounts are identified above.
- Existing agreement/payment currency support remains USD. A proposed revision due date does not silently amend accepted terms; an agreed paid addition follows the existing agreement-version rules.
- Invited freelancers must accept their invitation before an employer adds them to a project's roster. Invitations prefill the selected role and explain this step.
- Locking/grouping are presentation features, not new authorization boundaries. Undo/redo records individual object edits; a multi-object operation is not a database-wide transaction. Conflicts retain drafts for review.
- Large diagrams may need zooming, fullscreen or the roster/task panels for readable detail. Provider sharing restrictions, blocked third-party embeds and unsupported media use the original-link/file fallback.

No hosted migration, deployment, real PayPal invoice/payment, data cleanup or reset was performed. PayPal remains Sandbox-only; signed webhook handling and provider settlement verification were not replaced. Earlier backend testing reports in the worktree were preserved.
