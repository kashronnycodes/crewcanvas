# CrewCanvas 2.0 implementation handoff

Development branch: `codex/intelligent-canvas` in the **nested `crewcanvas` repository**.
No production deployment, remote migration, real payment, or live model call was performed.
The working changes that existed before this task, including the custom demo roster and
hosting configuration, were preserved. Changes have not been committed.

## Implemented

- A light, canvas-first workspace with contextual inspectors, floating focus controls,
  workflow navigation, connection inspection, a compact financial flow and activity timeline.
- Project, agreed-work, delivery, revision, payment and file nodes on the existing React Flow canvas.
  Work cards reuse existing project/agreement records; they do not introduce a separate task database.
- Desktop file drops use React Flow's screen-to-world conversion, including pan and zoom.
  The canvas picker and project delivery picker also work without desktop drag-and-drop.
- Integrated uploads use private Supabase Storage. The authenticated API bounds the request,
  validates extension, MIME, actual file signatures, size and project access, then commits metadata
  and audit activity. File access uses fresh, authorized, 60-second signed URLs.
- Demo binaries persist in IndexedDB; metadata and layout use the existing local demo repository.
  Blob URLs are temporary previews, never the stored file. Browser storage is local to its origin.
- Image, video, audio and PDF previews; generic native-app file cards; full-size preview dialogs;
  renaming, downloading, project attachment, replacing, retaining versions and deleting unused files.
- Movable cards and resizable file cards. Layout writes serialize local edits while retaining
  optimistic conflicts against remote changes. Keyboard arrow moves also save.
- Workers can submit a stored project file. Deliveries pin the exact binary version, so replacement
  does not silently change reviewed evidence. Submitted files cannot be deleted or moved to another project.
  Database locks and a delivery trigger protect this rule against concurrent requests.
- Existing employer approval, feedback, revision negotiation and bilateral additional-fee approval
  remain in place. Revision cards link to their task and the preceding delivery; references can be uploaded.
- Canvas handles support meaningful relationships. Project/task/seller relationships come from existing
  records; extra visual relationships save in `canvas_layouts.data.connections`. Invalid assignments,
  cross-project payment links, foreign cards and duplicate connections are rejected.
  Dragging a task to an unassigned workspace file attaches it to that project. Other visual links do not grant access.
- Focus modes emphasize tasks, people, payments, files and deadlines (overdue or within seven days),
  with connected context retained and unrelated objects dimmed.
- Financial summaries use integer cents. Accepted-work balances exclude processing funds and
  unapproved revision proposals. Accepted additions already appear in the accepted agreement total.
  Integrated financial summaries exclude historical sample projects.
- Workspace command bar: live AI classifies a supported read-only intent; server/domain code calculates
  and renders the facts. Supported queries cover approved payments awaiting action, today's recorded
  activity, overdue work, monthly verified gross payments and suggested layout. The demo is explicitly deterministic.
  AI has no money, approval, deletion or membership tools. Layout changes require clicking Apply.

## PayPal status

The existing integration is **PayPal Sandbox seller Invoicing**, not merchant checkout plus a
marketplace Payouts integration. It remains limited to the configured connected seller (Ava's stable
account ID; the custom local roster uses a different display name).

The worker issues an invoice after delivery approval. The employer's payment node opens a confirmation
dialog, then the provider's Sandbox invoice page. The employer authorizes payment there using the
separate personal Sandbox payer. Polling/manual reconciliation and verified webhooks update the invoice.
Opening or returning from PayPal never marks the invoice paid. Pending, failed, cancelled, unknown,
sample and verified-settled states remain distinct. Existing idempotency, invoice allocations,
webhook signature verification, event deduplication and reconciliation leases are retained.

There is **no automatic freelancer Payouts capability**. The inspector states this limitation. An
accepted project without an issued seller invoice remains awaiting payment; it is not called paid.
Live Sandbox authorization, signature verification and settlement still require external credentials
and the existing retry scheduler. No claim is made that a real Sandbox transaction passed here.

## AI status

The existing live brief extraction and advisory revision-scope comparison remain intact. The new
`ai/workspace` endpoint uses the same server-only OpenAI configuration, structured output validation,
rate limit and audit mechanism. Only an allowed intent is returned by the model; monetary totals
and highlighted IDs are computed from authorized records.

Monthly spending uses completed USD `PAYPAL` transaction records and their actual `payment_date`,
not invoice synchronization time. The response explicitly reports **gross Sandbox payments**, not
net spend; refunds, sample data, pending, external/manual, unknown and undated transactions are excluded.
Human pricing remains in the existing revision proposal workflow; AI does not invent binding charges.
Live AI behavior and the billable evaluation suite were not run without credentials.

## Migration

Apply `supabase/migrations/20261030210134_intelligent_canvas.sql` **after the initial migration**
to the dedicated CrewCanvas Supabase project, before deploying the updated API/frontend.

It adds:

- Private `crewcanvas-files` Storage bucket, with a 25 MiB object limit and no public client upload policies.
- `workspace_files`, RLS read isolation and server-only `mutate_workspace_file` RPC.
- Append-only `workspace_activity` with role/project-based read isolation.
- A delivery-file validation trigger, immutable version checks and transaction locks.
- Server-only `workspace_payment_records` RPC for authorized transaction calculations.

The existing canvas JSON format accepts optional `cards` and `connections`; old layouts still validate.
No existing project, invoice, agreement, activity or payment history is rewritten by the migration.

## Environment variables

No new secrets are required beyond the existing examples.

Frontend (`.env.example`): `VITE_APP_MODE=integrated`, `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`. The default `demo` mode needs none.

Edge secrets (`supabase/functions/.env.example`): `ALLOWED_ORIGIN`, `OPENAI_API_KEY`,
`OPENAI_MODEL`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`,
`PAYPAL_MERCHANT_ID`, `PAYPAL_SELLER_EMAIL`, `PAYPAL_PAYER_EMAIL`.
Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server.
Keep all secret keys out of `VITE_` variables. Seed and scheduler setup remain in the README.

## Validation actually performed

- `npm test`: **55 tests passed in 11 files**, including the existing 41 tests.
- `npm run check:server`: all three Edge Function entry points type-check.
- `npm run build`: includes frontend/shared/test TypeScript checks and a production Vite build.
- Embedded PostgreSQL executes both migrations, with a stub bucket table for the Storage DDL.
  New tests exercise file RLS, peer denial, forbidden writes/RPC calls, stale replacements,
  immutable evidence, audit immutability and dangling-layout cleanup. Existing webhook deduplication tests pass.
- Browser test at 1280×720: upload a harmless text fixture, refresh, inspect, rename, attach to project,
  switch to the worker, submit the exact stored version, switch to employer and approve.
  The work became accepted while its payment node remained awaiting payment.
- Browser drag test: moved a file card and verified its exact world position after reload.
- Browser command and timeline checks: approved balance uses actual demo records; file events appear.
- Browser responsive check at 390×844: project review, stored-file access and upload picker are available;
  mobile canvas controls remain available. The viewport override was reset afterward.
- Fixed an empty/invalid Drive URL refinement crash found during file submission and added regression coverage.

Not run: real Supabase Storage uploads/signed downloads, real authentication against a provisioned
project, live PayPal Sandbox payment/webhook round trips, live OpenAI evaluation, OS file-drop automation,
and a large-node stress benchmark. These need the appropriate configured services or separate performance tooling.

## Main changed and added files

- `shared/types.ts`, `shared/validation.ts`, `shared/domain.ts`, `shared/workspace.ts`: contracts,
  file delivery, validation, relationships, integer financial calculations and grounded command responses.
- `src/components/Canvas.tsx`, `IntelligentCanvas.tsx`, `WorkspaceFiles.tsx`, `ProjectDrawer.tsx`:
  canvas behavior, cards, inspectors, focus, commands, uploads and file-based review.
- `src/fileService.ts`, `src/layoutQueue.ts`, `src/services.ts`, `src/App.tsx`: persistent binary storage,
  API adapters, authorization checks and serialized layout saving.
- `src/workspace.css`, `src/main.tsx`: light visual system and responsive canvas UI.
- `supabase/functions/_shared/files.ts`, `workspace-ai.ts`, `backend.ts`,
  `supabase/functions/crew-api/index.ts`: authorized file operations, snapshots and workspace AI.
- The migration above; `tests/workspace.test.ts`, `workspaceDatabase.test.ts`,
  `fileDelivery.test.tsx`, `layoutQueue.test.ts`, and the harmless upload fixture.

## Review and release

1. From `crewcanvas`, run `npm ci` if dependencies are missing, then `npm run dev`.
2. Use Explore a project for a workflow, People & role groups for the existing team canvas,
   and Upload (or a desktop file drop) for a new card. Select a file to inspect or attach it.
3. Open the assigned project as a worker, choose Deliverables, upload/select a file and submit.
   Return as the employer to approve or request revisions. For real authentication use separate sessions.
4. Review the nested repository's diff and untracked new files. Do not include unrelated pre-existing
   changes in a commit without reviewing them.
5. Configure a dedicated development Supabase project; inspect/link it and apply both migrations
   using the installed CLI's documented commands. Deploy the updated `crew-api`, then the frontend
   in integrated mode. Preserve existing webhook/reconcile functions and retry scheduler.
6. Complete the external gates in `docs/release-checklist.md`: two-user permissions, genuine private
   uploads/downloads, actual AI calls and a complete PayPal Sandbox invoice/verification cycle.
7. Production deployment remains a separate user-controlled step.

## Known limits

- Uploads are bounded standard requests, up to 25 MiB each. Larger/resumable uploads, antivirus scanning,
  document conversion and generated Office/PSD/AI thumbnails are not implemented.
- Supported images/videos/PDFs use browser-native previews; other accepted formats show a file icon.
- IndexedDB demo files are local, not multi-user cloud storage. Clearing site data removes them.
  Resetting the demo removes its records; old binary blobs may remain until site data is cleared.
- A removed file's already-issued signed URL can remain usable until its 60-second expiry.
- Standard upload network failures after server completion may require a refresh before retrying.
  Failed post-delete Storage cleanup is logged and requires operator cleanup of the private object.
- Currency remains USD, as in the existing domain. Work cards aggregate a project's agreed items;
  independent per-item task assignment is not a new subsystem in this change.
- The canvas has bounded schema limits (2,000 saved cards / 4,000 visual links); that is an input
  bound, not a measured performance guarantee. The existing reconciliation scheduler remains bounded.
- The build emits benign warnings about comments in the existing pinned Zod dependency; it succeeds.

Official implementation references: [private Storage and signed URLs](https://supabase.com/docs/guides/storage/serving/downloads),
[Storage access control](https://supabase.com/docs/guides/storage/security/access-control),
[PayPal Invoicing](https://developer.paypal.com/api/invoicing/v2),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
