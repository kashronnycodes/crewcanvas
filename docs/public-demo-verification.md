# Verification — public demo accounts

Verified locally on November 7, 2026 (Asia/Manila), branch `codex/public-demo-accounts`, based on `0837c1c`. No merge or deployment performed.

| Check | Result |
| --- | --- |
| TypeScript (`tsc -b`) | Passed |
| Production build (`npm run build`) | Passed |
| Vitest | 138 tests passed, 23 files |
| Playwright, PR #5 suites + new public demo | 64 passed; 5 intended viewport skips; no failures |
| New demo browser coverage | All eight scenarios passed on Chromium, Mobile Chrome and Mobile Safari |
| Existing negative endpoint security | Passed, including forged signature rejection through actual PayPal verification |
| Actual PayPal Sandbox configuration | Passed, employer only; no invoice created |
| Existing Sandbox flow (`--verify`) | Passed: accepted synthetic work, $1.25 invoice, paid $1.25, pending $0 |
| Dedicated integrated public-demo provisioning | Not run: no dedicated isolated cloud project supplied |
| Dedicated integrated demo browser suite | Not run: requires the above project/deployment and disposable password |

The first sandboxed Vitest launch failed before executing tests because of Windows temporary-file rename permissions. Rerunning with TEMP/TMP set to the ignored `.supabase/test-temp` directory passed. Browser tests ran outside the Windows sandbox so Vite and browsers could communicate on localhost. Browser binaries are installed under ignored `.supabase/playwright-browsers`.

PR #5 was reviewed, then its three suites were brought into this branch. Its old button labels were updated to current labels (Approve Work, Request Revision, Propose revision fee, Approve revision fee), and tests explicitly open Details & tools for the existing advanced canvas. Assertions were retained; no failing workflow was removed. The five pre-existing skips are desktop-only canvas tests on two mobile projects and a mobile-only overflow check on desktop.

Warnings are existing Radix dialog accessibility warnings in unit tests and third-party Rollup annotation warnings. The new demo-account actions have explicit accessible names and 44px minimum touch targets. Public demo passwords are not exposed; all public account entry is clearly simulated. Existing production/team credentials were neither printed nor altered.
