# Fullscreen board layout fix — 12 November 2026

Fixed the shared fullscreen surface for Work map, Whiteboard, and the project board in Files & team. Existing uncommitted CrewCanvas changes were retained.

No reference screenshot was attached to this request. Before editing, the issue was reproduced in the running local app and captured using the real judging workspace.

## Cause

`FocusCanvas` expanded to the viewport, but the inner project board still matched its normal page rule in `simplify.css`: `height: max(560px, calc(100dvh - 370px))`. The board therefore stayed 710px high on a 1080px-high screen. Its bottom controls are positioned relative to that shortened board, leaving the unused area below them. The standalone board and hierarchy canvas also had normal-layout height/min-height constraints.

The shared fullscreen wrapper now forms a definite flex column. Fullscreen-only rules override the child board's normal height constraints; the task header keeps its natural compact height, and React Flow fills the remaining space. The controls remain anchored to the full-height board. Normal-layout sizing is unchanged.

React Flow 12.8.6 already observes its DOM container with `ResizeObserver` and updates its renderer width/height. The corrected flex dimensions therefore reach the renderer when entering, leaving, or resizing fullscreen. The component stays mounted; there is no forced fit-to-view, scaling, node-size rewrite, or viewport reset. Tests verify preserved pan/zoom, tool, selection and unsaved text, and verify drag/draw screen-to-world coordinates after resizing.

Escape now exits the owned native/fallback fullscreen surface. A surrounding Radix tools dialog consumes that Escape without closing the dialog or discarding board context.

## Measured result

At the same 1440 × 1080 desktop viewport:

| Measurement | Before | After |
| --- | ---: | ---: |
| Fullscreen wrapper height | 1080px | 1080px |
| Actual board height | 710px | 1080px |
| Interactive canvas height | 623px | 993px |
| Canvas bottom | 711px | 1080px |
| Bottom-controls bottom | 697px | 1066px |

The after canvas is exactly the remaining height below the 71px header and its 16px vertical margins. Bottom controls sit 14px above the board bottom.

## Verification

- Focused geometry regression failed before the fix with a 369px discrepancy, then passed after the fix.
- Seven new browser scenarios pass: all three board entry points; button/Escape exits; repeated entry/exit; resizing; native fullscreen fallback; pan/zoom; card navigation; unchanged card proportions; selection and unsaved drafts; drag and drawing coordinate accuracy.
- Complete desktop browser suite: 18 passed.
- Unit/database suite: 200 passed across 32 files.
- TypeScript and Vite production build: passed.
- Real local app before/after screenshots captured and visually inspected, including 1190 × 860 fullscreen resize and restored normal layout.

```powershell
npm test
npm run build
npx playwright test e2e/fullscreen.spec.ts --project=chromium
npx playwright test --project=chromium
```

On this host, Chromium browser checks use `CREW_BROWSER_CHANNEL=msedge` and `PLAYWRIGHT_BROWSERS_PATH=.supabase/playwright-browsers`; unit tests use the writable workspace temporary cache. Browser pointer/edit regressions intercept HTTP using the existing explicit test fixture; real screenshots use the running app without changing its saved board content.

## Evidence

- [Before fullscreen](evidence/fullscreen/before-fullscreen.png)
- [After fullscreen](evidence/fullscreen/after-fullscreen.png)
- [After window resize](evidence/fullscreen/after-resized.png)
- [Normal layout restored](evidence/fullscreen/after-exit.png)
- [Before measurements](evidence/fullscreen/before-dimensions.json)
- [After measurements](evidence/fullscreen/after-dimensions.json)

Files: `src/components/FocusCanvas.tsx`, `src/components/Modal.tsx`, `src/fullscreen.css`, `src/main.tsx`, and `e2e/fullscreen.spec.ts`.

The change is available in the local preview at http://127.0.0.1:5173/. It has not been deployed.
