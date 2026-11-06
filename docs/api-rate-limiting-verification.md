# Verification — API rate limiting

Executed November 7, 2026 (Asia/Manila). No merge, deployment, real charge or production load test was performed.

| Check | Result and scope |
| --- | --- |
| TypeScript / production build | Passed |
| Deno checks | Passed for crew-api, paypal-webhook and reconcile |
| Existing + new Vitest suite | 162 tests passed in 26 files |
| PostgreSQL 17 independent-session concurrency | Passed: 16 concurrent user payment attempts admitted exactly 5; 8 concurrent project attempts admitted exactly 2 |
| Quota database isolation | Passed: independent Auth-user quota, saturated counters, retry seconds, browser RPC privilege denial |
| Supabase security advisor | Passed on isolated local PostgreSQL test schema: no issues found |
| Browser regression suites | 20 passed, 1 intended mobile-only check skipped on desktop; no failures |
| Browser 429 experience | Passed on desktop Chromium, Mobile Chrome, Mobile Safari; AI retry message/action recovery, one payment request without automatic retry |
| Hosted negative endpoint security | Passed, including signed-in attempts at service-only routes and actual PayPal rejection of a forged webhook signature |
| Hosted PayPal Sandbox flow (standard and `--verify`) | Passed: accepted synthetic work, existing $1.25 invoice fully paid, $0 pending; existing invoice reused |
| Hosted integration regression | 13 checks passed, including three real Auth accounts, assignment, RLS isolation, private files, revision/delivery workflow and logout |
| New limiter on hosted Supabase | Not run: migration/functions deliberately not deployed |

The hosted checks are regression evidence for the existing deployment, **not** proof that new quota enforcement is deployed. New enforcement is verified by the actual Edge handler with controlled provider/database responses, PGlite PostgreSQL tests, and real independent sessions against disposable PostgreSQL 17. Browser tests use explicit synthetic Auth/API responses for the 429 UX and do not claim backend integration coverage.

New tests cover policy defaults/validation, general/specialized routing, unauthenticated/preflight behavior, trusted Auth identity, sanitized database failures, rejection before payment/storage/AI side effects, shared AI admission across all applicable endpoints, single admission for a two-model-call summary, retained audit writes, provider 429 handling, migration of current AI usage across memberships, window rollover and stale-window protection, bounded cleanup, browser RPC denial, webhook durable deduplication/retry/completion, and unchanged ordinary workflows.

During development, the standalone psql concurrency harness initially omitted a transaction wrapper around the migration; PostgreSQL correctly rejected LOCK TABLE. The harness now applies it in a transaction, and both subsequent concurrency runs passed. Browser AI tests initially looked for the AI input in the simple canvas; opening the existing Details & tools view fixed the test locator without changing product UI.

Windows sandbox TEMP/TMP were set to ignored workspace folders. An intermittent Windows rename denial prevented one unit suite from loading during a concurrent verification run; the final complete Vitest rerun outside the sandbox passed with two workers. Browser servers and Docker checks also ran outside the sandbox to permit localhost/process access. Existing third-party Rollup annotation and Radix dialog-description warnings remain. Docker test containers were verified removed after checks.
