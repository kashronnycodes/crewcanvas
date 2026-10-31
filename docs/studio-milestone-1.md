# CrewCanvas 3.0 — freelancer-first milestone 1

Product identity: **A visual workspace where freelancers and clients organize,
create, collaborate, deliver, and get paid.** Project whiteboards support the
freelance workflow. They do not replace agreements, deliverables, revision
negotiation, approval or verified payment records.

## Implemented

- A clearer client project index grouped by responsible freelancer. Freelancers
  land on their assigned projects with deadlines, delivery/revision counts,
  payment received and direct access to the existing project drawer.
- A cohesive Inter typography system, light/dark theme tokens and a persistent
  preference. Existing domain forms and controls remain available.
- Fullscreen work map and project board, browser Fullscreen API with viewport
  fallback, Escape exit and restoration before opening a domain drawer.
- Private project boards for the client and assigned freelancer: sticky notes,
  standalone text, rectangles/circles/diamonds/lines/arrows, completed freehand
  strokes, HTTPS reference cards, named frames and project file cards.
- Selection, dragging, resizing, layering, duplication, native copy/paste,
  multi-selection, zoom/pan/fit and connectors between board objects.
- Whiteboard-only undo/redo, limited to 50 recent local actions. A collaborator's
  newer object version blocks undo instead of being overwritten. Business
  operations never enter this history.
- Object-level persistent changes and Supabase Postgres Changes subscriptions.
  Version-checked writes reject conflicts. Reconnect resubscription and a
  15-second repair read recover missed events. Completed strokes save once;
  pointer movement is not sent to the database. Failed object edits and text
  drafts are retained locally, with explicit retry/review/discard controls.
- Anchored feedback with server-derived membership attribution, replies and
  resolve/reopen. Comments are non-binding discussion; paid changes still use
  the existing revision/agreement workflow.
- Contextual Gemini summaries in the project index for both roles. The existing
  task/revision intelligence, server authorization and provider rollback remain.
- Invite-only team-test sign-in reflects hosted signup settings. A revoked
  session can recover to sign-in without clearing unrelated storage or drafts.

## Data and security

The additive migration `20261031221200_project_whiteboards.sql` is applied only
to `tsnwowlyrlxpwwetmxns`. It adds `board_objects` and `board_comments`, their
indexes, validators, RLS and Realtime publication entries. It does not replace
existing tables or alter payment/provider functions.

Both new tables derive access from `private.can_read_project`, using stored
workspace membership and project assignment. Anonymous access and peer-worker
access are denied. Clients cannot change object attribution/project scope,
hard-delete records, or write payment tables. Database validation bounds object
types, content, coordinates, drawings, dimensions and references. Connector
endpoints and file references must belong to the same authorized project.
Soft deletes preserve authorized Realtime filtering and permit safe undo.

The owner explicitly approved disabling public signup while SMTP is absent and
setting Auth `site_url` to `https://crewcanvas.vercel.app`. Both changes are
applied and the remote configuration diff is empty. Email confirmation remains
enabled. Four real team accounts await the owner's email list; synthetic
confirmed accounts were used for verification. No credentials are in this report.

Gemini and PayPal credentials remain in Supabase. PayPal is Sandbox-only; no
invoice or payment was created by this milestone. `OPENAI_API_KEY` is retained.

## Verification

- 122 automated tests in 19 files, TypeScript/Vite build and all three Edge
  Function type checks passed.
- Ten new database/contract tests cover note/stroke persistence, peer
  isolation, simultaneous independent edits, stale versions, schema/URL bounds,
  connector isolation, attribution, feedback, deletion/restore and financial
  write denial. Additional tests cover theme persistence, invite-only sign-in
  and scoped expired-session cleanup.
- A final race review tightened drag, resize and keyboard movement to the
  version captured when editing began. A database regression simulates a
  collaborator moving the object during the gesture and verifies that the
  stale save cannot replace their newer position.
- Four hosted whiteboard groups passed twice: bidirectional authorized Realtime,
  denied outsider reads/writes/events, conflict protection, feedback resolution
  and synchronized soft deletion. `npm run test:board` uses synthetic accounts;
  `--prepare-browser` is an explicit opt-in credential-preparation step.
- Two independent browsers signed in as client and freelancer. The freelancer
  saw the client edit without a refresh; the client saw a subsequent freelancer
  reply without refreshing. Note persistence, undo/redo, drawing save, fullscreen
  and Escape were exercised. The freelancer's project-index Gemini summary
  displayed a genuine live response. Desktop and narrow mobile layouts were
  inspected; the mobile project heading was corrected after visual review.
- All 13 existing hosted integration groups passed, including invitations,
  assignment, RLS, private uploads, immutable versions, delivery, revision,
  resubmission, approval, notifications and sign-out.
- All eight live AI groups and eight endpoint-security groups passed again.
  The existing USD 1.25 Sandbox invoice remains paid, 125 cents settled and
  zero pending. No additional invoice was created.
- Hosted security advisors found no ERROR. Existing warnings remain for leaked
  password protection and managed non-relocatable `pg_net` in `public`.
- The browser test caught missing React Flow base CSS in freelancer-only loads;
  the stylesheet is now global. It also caught stale revoked-session recovery;
  sign-out clears only the affected project's stale credential keys.

## Measured performance and practical limits

Canvas modules are lazy loaded; unaffected board nodes are memoized and only
visible elements render. React Flow's measured node dimensions are retained as
client presentation state while object records synchronize. A repeated local
drag saved successfully with zero new React Flow initialization warnings,
after those warnings were observed before this fix. The initial JavaScript entry measured approximately
638 KB minified / 190 KB gzip, versus 868 KB / 264 KB before splitting this
milestone: about 27% less entry payload. This is a bundle measurement, not an FPS
claim. Final hashes/sizes may change with a subsequent build.

A large-board browser/FPS benchmark and exhaustive offline/reconnect fault
injection remain pending. Boards currently retain at most 1,000 objects,
including tombstones; drawing strokes have at most 1,000 sampled points and
individual payloads are capped at 64 KiB. Undo history is local to the open board
session, while failed draft data survives reload on the same device.

## Explicitly unfinished

- Active collaborator presence, live cursors and edit/selection indicators.
  Decorative online dots were removed; the UI does not claim these exist.
- Nested/grouped board objects and moving an entire named frame with its
  children. Frames currently provide movable visual sections. Existing people
  role groups remain available in the employer work map.
- AI conversion of selected notes, board templates, exports and advanced search.
  Current AI context uses the existing authorized structured project records;
  casual whiteboard notes/comments do not silently alter agreements or AI facts.
- The broader 16-case AI quality benchmark and full device/gesture matrix.
- Edge browser file-picker automation requires the extension's file-URL
  permission, which was left unchanged. API upload/storage/version workflows
  passed; the browser file-picker check did not complete.
- Single-seller Sandbox onboarding: the existing verified merchant remains
  mapped to its retained synthetic freelancer. Real teammate seller mapping
  needs review; arbitrary new memberships cannot issue invoices automatically.
- SMTP and leaked-password-protection review before broad public signup.

## Team rehearsal

1. Sign in with a confirmed team account and use its authorized workspace.
2. Client: invite the freelancer, create a project and propose the agreement.
3. Freelancer: open **Projects**, accept the agreement and review deadlines.
4. Both: choose **Project whiteboard**, select the same project, edit notes,
   draw, connect objects and use anchored feedback. Confirm the other browser
   updates. Try a stale edit; it must not overwrite the newer version.
5. Use **Agreement & deliverables** for uploads, submission, free/paid revision
   negotiation and approval. Casual comments are not revision agreements.
6. Use **Summarize my work** or **Summarize workspace** and review the result.
7. Review payment status as Sandbox test money. Reuse the verified USD 1.25
   evidence; do not create another payment simply to repeat the demonstration.

Production release status is tracked in the PR and deployment verification
report. Rollback remains the original demo deployment
`dpl_Bynbx25tuQCP2dar7xD4mGiVgxpo`; no database rollback/reset is required to
restore that frontend.
