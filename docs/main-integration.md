# Main integration — November 9, 2026

`codex/crewcanvas-workflow` merges main commit
`973205a291d7c777dc55289e4eebbf004adddc34` into workflow commit `d54a7f2`.
The working tree was clean before the merge; the other two worktrees were untouched.

## Combined behavior

- Main's warm paper reference styling, compact project/role overview, avatars,
  roster, board project/role editing, task duplication as draft, delivery previews,
  revision composer and whiteboard editing tools remain available.
- Studio, detailed Project whiteboard, Task list and member-first Revisions share
  the saved board project/role/member/task hierarchy. Main's `organization` fields
  remain canonical; earlier `parentProjectId` records are adapted without rewriting
  accepted terms or payment ledgers.
- Browser Back and explicit Back controls traverse project, role, member and task.
  Scroll positions restore in both modal and reference side panels. Switching demo
  identities resets navigation rather than carrying another member's panel forward.
- General and member-specific task creation use the same main task form in every
  view. Member assignment is fixed in member context; general creation can choose
  a saved board project, role and eligible workspace freelancer. Main's draft and
  proposed statuses, AI planning and editable deliverables remain intact.
- Revision negotiation preserves main's optional deadline editing plus workflow
  counteroffer explanations, authors, predecessor history and stale-term guards.
  Only acceptance updates the agreed total; payment status remains independent.
- Main's rate limits, retry handling, immutable agreements, board geometry guards,
  file versions and worker isolation remain covered by regression tests.

## Validation

- Unit and embedded PostgreSQL/PGlite suite: **188 tests passed in 30 files**.
- Full desktop + Pixel 5 browser suite: **62 passed, 2 conditional device skips**.
- Additional desktop/mobile task-list assignment, member-form, navigation and
  revision regression: **8 passed**.
- Production TypeScript/Vite build and `npm run check:server`: passed.
- Visual inspection: Studio reference overview, detailed whiteboard, member task
  form, delivery panel and mobile revision composer; light and dark modes covered.
- Safari/WebKit was not run. Browser runs used installed Edge with Playwright's
  desktop and Pixel 5 profiles. Provider previews, AI and payments used fixtures or
  the explicitly labeled local demo.

Local server confirmed at `http://127.0.0.1:5173`, PID 14532, with Vite's command
pointing to this `crewcanvas` worktree and served source paths matching it. Git's
current branch is `codex/crewcanvas-workflow`; other worktree servers were not used.

## Review and deployment boundary

Draft PR #11 targets main. The push workflow runs tests/build/type checks only;
Vercel builds the Vite frontend for the feature branch as a Preview in the existing
CrewCanvas project. No production branch, configuration, backend function or
migration was deployed. Migration files inherited from main are source history,
not an executed migration.

Open the new PR Preview with `/?demo=1`, choose **Employer Demo**, and inspect
Studio, Project whiteboard, Back, member task creation and Revisions. Vercel
Authentication remains enabled, so the ordinary Preview link requires project
access. The demo needs no CrewCanvas credentials and stores data only in each
browser. New parent-task/counteroffer API contracts still need the updated backend
before authenticated multi-user testing. No invoice or payment was created.

Current screenshots: [Studio](screenshots/project-studio.png),
[whiteboard](screenshots/project-whiteboard.png),
[member form](screenshots/member-task-form.png),
[Revisions](screenshots/revisions.png), [payment summary](screenshots/task-payments.png).
