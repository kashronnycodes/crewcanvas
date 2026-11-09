# CrewCanvas reference alignment

November 8, 2026 · local branch `codex/collaboration-workflow`. These refinements build on the earlier collaboration studio implementation. Nothing was pushed, deployed or migrated.

## Reference 1: setup and interaction flow

The default canvas now shows **Project → Project roles → horizontal role cards**, following the supplied [flow reference](evidence/reference-alignment/reference-flow.png). Members and tasks are progressively revealed in contextual panels instead of filling the initial canvas. The full automatically arranged member/task map remains available through **Show task map**.

Clicking a role opens a roster with round avatars, names and an **Add member** tile. Clicking an avatar opens that member's assigned work. Opening a task leads directly to its delivery review, including its brief, version-linked preview, Approve and Request revision actions. The task panel occupies the same position and width as the roster. Back returns to the member's task list.

Request revision opens a focused form in the same panel, with persistent Back navigation, the reviewed delivery version, requested changes, optional due date and free/paid arrangement. A paid amount remains a proposal requiring the existing negotiation flow. Leaving and reopening the form preserves the unsent feedback. Revision history now shows each request's associated fee outcomes.

Fullscreen opens the same canvas. Opening contextual panels exits focus mode so panels remain visible; tool popovers render within native or fallback fullscreen. Automatic graph fitting waits for new nodes, while explicit Fit to content and user movement take precedence over pending automatic fitting.

## Reference 2: visual direction

The supplied [style reference](evidence/reference-alignment/reference-style.png) guides the warm off-white surfaces, black typography and buttons, muted gray secondary text, thin borders, restrained corner radii, dotted canvas, technical labels and diagonal hatch divider. Its developer-marketing copy was not carried into CrewCanvas. Existing note colors and meaningful status colors remain distinct from interface styling; dark-mode input tokens are preserved.

## Verified screenshots

| View | Desktop | Mobile |
| --- | --- | --- |
| Project and peer roles | [Overview](evidence/reference-alignment/overview-desktop.png) · [Fullscreen](evidence/reference-alignment/overview-fullscreen-desktop.png) | [Overview](evidence/reference-alignment/overview-mobile.png) |
| Avatar roster and Add member | [Roster](evidence/reference-alignment/roster-desktop.png) | [Roster](evidence/reference-alignment/roster-mobile.png) |
| Task delivery review | [Delivery](evidence/reference-alignment/delivery-desktop.png) | [Delivery](evidence/reference-alignment/delivery-webkit.png) |
| Revision form | [Revision](evidence/reference-alignment/revision-desktop.png) | [Revision](evidence/reference-alignment/revision-webkit.png) |

These screenshots use synthetic local demo records. Provider preview responses are UI fixtures or the original-link fallback, not proof of live provider access. The $0.55 shown in the form is an unsent test offer; the navigation test confirms existing invoices and revision counts remain unchanged.

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Vitest, including local database/security/payment regressions | 176 passed in 28 files; exit 0 | [Log](evidence/reference-alignment/vitest.log) |
| Complete Playwright suite | 82 passed, 5 existing platform-specific skips; exit 0 | [Log](evidence/reference-alignment/playwright.log) |
| Production build and frontend TypeScript | Passed; exit 0 | [Log](evidence/reference-alignment/build.log) |
| Deno server checks | All three entrypoints passed; exit 0 | [Log](evidence/reference-alignment/server-check.log) |

The new checks cover the compact overview, optional detailed map, avatar roster, member-to-delivery navigation, revision Back navigation and unsent draft preservation. Existing checks cover light/dark editing, persistence, grouping, locks, drawing, uploads, role restrictions, revision negotiation and payment-state separation. Browser runs exposed mobile fitting/portal placement races; these were corrected before the passing full run. The five skips remain the existing desktop-only group cases on mobile and mobile-only overflow case on desktop.

No authentication, financial domain, permission policy, provider handling or hosted schema change was made for this visual refinement. The earlier implementation's unapplied migration and hosted verification gates still apply before any separately authorized release. Only the existing CrewCanvas Supabase project `tsnwowlyrlxpwwetmxns` is in scope; no production or unrelated project was accessed for these tests.
