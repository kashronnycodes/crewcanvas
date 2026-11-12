# Current navigation

Task pages now open from Project Studio or My Tasks. All five sections appear in one scrolling page; member clicks show only basic information. See [member navigation](member-navigation.md). The older Files-first/View-menu description below is historical. Verification images are local and excluded from Git because they can contain private work.

# Member files and revision references

Opening a member now opens their files directly. The compact header retains the member name, Back, Close and Add task. A task selector appears only when there is more than one relevant task. Files & previews is the default view; a native View menu exposes Task details, Revisions, Payments and Activity. The default view has no long breadcrumb, repeated assignee form, contract warning, agreement or payment overview.

Uploaded project files appear as named thumbnail/file cards. Clicking opens a larger private preview. Uploads remain separate from submitting completed work; submission, approval, prior versions, external deliverable links and payment history stay available. Assignee changes remain subject to the existing agreed-work/payment-history restrictions, explained when a restricted change is attempted in Task details.

Task duplication has been removed throughout the roster, board menu, task clipboard/paste handling and draft-copy form plumbing. The unused draft-copy helper and its obsolete test were removed. Ordinary draft creation/saving, task editing, board object duplication and whiteboard object copy/paste remain.

## Revision reference images

The revision composer contains a separately labeled image area. It supports file choice and drag/drop for PNG/JPG/WebP/GIF, up to ten images of 25 MB each. Selection creates local thumbnails, supports a larger preview and removal, and does not upload or create a revision until Send revision request is deliberately used. Uploads use the existing private bucket, authenticated upload endpoint, byte/type validation and progress reporting. Failed uploads retain the selected images for retry; already uploaded images are reused on retry.

Reference files have a distinct `revision_reference` purpose and remain attached to their task. Revision JSON pins each selected file ID and exact stored version. The existing task authorization governs upload, signed preview URL issuance and file/revision reads; no bucket or permission policy is made public. References reappear in their revision history and a separate gallery in the member's files view after refresh. They are excluded from ordinary project-file cards and deliverable submission pickers.

The API validates reference purpose, task, MIME and version before requesting a revision, and refuses to submit references as completed work. The migration adds private validation/retention triggers, protecting correct task links, pinned versions, and immutable reference history even against concurrent deletion or moving. Existing files, revisions, assignments, approvals, payments and access policies are not rewritten.

## Verification

Focused browser tests cover direct member entry, previews, multiple-task selection, secondary views, Back, action-triggered reassignment restrictions, reference selection/drop/removal, progress, upload failure/retry, correct revision attachment, refresh, assigned-worker access and exclusion from deliverables. Separate regression coverage checks ordinary draft saving and whiteboard copy/paste.

PostgreSQL tests exercise real persisted reference metadata, task/version validation, immutable reference lists, evidence retention, refusal to submit references as deliverables, and denial of unrelated-worker access through existing RLS. Existing unit, payment, AI, collaboration and fullscreen checks remain part of the regression suite.

All 223 unit/database tests, 26 desktop browser regressions, two mobile Chromium flow checks, the production build and Deno backend checks passed. Ordinary draft saving and actual whiteboard-object copy/paste were verified separately from the removed task-copy feature.

The user explicitly approved the new shared backend update. On November 12, 2026 (Asia/Manila), migration `20261111205343_revision_reference_images.sql` was applied and `crew-api` was deployed to the verified CrewCanvas Supabase project. No existing rows or access policies were rewritten.

Real authenticated verification created one isolated QA task, used its assigned freelancer to accept terms and upload a deliverable, and used the owner to upload a separate reference image and request a revision. A fresh read retained the correct task/revision/file version. The owner and assigned freelancer fetched byte-identical image previews; an unrelated account was denied. The private bucket remained private. Attempts to submit the reference as work, attach it to another task or an invalid version, or delete linked reference evidence were rejected. Existing tasks, assignments and payment history were unchanged.

A live browser then used normal account sign-in to verify the default files view, private image preview, selection/removal without writes, and reference persistence after refresh. `*-live.png` images show the real backend connected to the updated local frontend. Other screenshots use deterministic synthetic browser-regression data. Evidence is recorded in `docs/evidence/member-files/live-verification.json` and `live-browser-verification.json`.

Post-deployment security advisors report only the same two pre-existing configuration warnings: `pg_net` in `public` and disabled leaked-password protection. No new function/RLS advisory appeared.

The updated frontend remains available at http://127.0.0.1:5173/. The public hosted frontend has not been republished as part of this backend approval.
