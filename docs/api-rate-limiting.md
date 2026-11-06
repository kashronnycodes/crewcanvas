# API rate limiting and abuse protection

Branch: `codex/api-rate-limits`, based on `0837c1c`. This branch is independent of `codex/public-demo-accounts`; it contains no demo-account UI changes. Nothing has been deployed or merged.

## Audit and policy

Previously, only AI analysis had a distributed limiter: `provider_store('ai_allow')`, with ten requests per workspace membership per minute. The table grew by actor/minute without cleanup, and one Auth user with multiple memberships could multiply the allowance. Invoice operations already used optimistic project versions, command idempotency, PayPal request IDs, invoice leases, charge reservations and uncertain-creation recovery. Uploads already bounded the actual request stream, validated file types/bytes and the 25 MiB file maximum, and authorized project/storage access. Those safeguards remain intact.

All limits below use fixed database-clock minute windows. Quotas count attempts; validation or downstream failures do not refund admission. General and specialized counters are separate. One AI request consumes one AI admission even when a workspace summary makes two model calls.

| Endpoint | Default limit per Auth user per minute | Additional scope |
| --- | --- | --- |
| Authenticated `crew-api/*`, including workspace onboarding, invitations, reads, commands, file metadata and layout | 120 | Applies to unknown/invalid authenticated requests too |
| `POST payments/issue` | General 120 + issuance 5 | 2 attempts per user/project/minute |
| `POST payments/reconcile` | General 120 + reconciliation 10 | 5 attempts per user/project/minute |
| `POST payments/verify-configuration` | General 120 + verification 5 | Existing employer-only permission |
| `POST files/upload` | General 120 + uploads 10 | Existing 25 MiB and project/file authorization |
| `POST ai/brief` | General 120 + shared AI 10 | Employer only |
| `POST ai/revision` | General 120 + shared AI 10 | Authorized assigned project |
| `POST ai/workspace` | General 120 + shared AI 10 | Authorized workspace snapshot |
| CORS `OPTIONS` | Exempt | Existing exact-origin response behavior |
| `paypal-webhook` | Exempt from user quotas | Existing signature verification, durable deduplication and retries |
| Service-only `reconcile` / diagnostics | Exempt from user quotas | Existing service authentication and invoice leases |

Direct Supabase Auth, PostgREST, Storage and Realtime endpoints are outside the `crew-api` middleware. Existing RLS, private Storage and board-object authorization remain in place. Whiteboard writes through PostgREST do not consume the Edge API quota. Public/Auth/IP abuse controls and provider-wide spending budgets remain infrastructure responsibilities.

## Identity, counters and concurrency

The Edge handler first verifies the bearer session using Supabase `auth.getUser`, then passes that returned Auth user ID to the limiter. Client body IDs, editable metadata and workspace headers never select the quota identity. The general gate runs before onboarding or request-body parsing. Expensive payment/upload admission is bundled into that same RPC. Project payment counters are checked after parsing a valid project ID and before entering invoice/reconciliation code; the RPC independently verifies membership/project access.

`private.api_rate_counters` has a primary key on `(auth_user_id, policy, scope_id)`. Each row stores a window, capped request count and expiry; it rotates in place instead of creating rows per request or per minute. An atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE` admits only requests below the cap, including the first-insert race. PostgreSQL row locks coordinate independent Edge instances. Counter increments saturate; denied traffic does not overflow integers. A request that waited across a window boundary cannot overwrite a newer window with an older timestamp. Multiple policies acquire counters in a fixed order.

The limiter transaction returns a denial value rather than raising on quota exhaustion, so already-consumed general attempts remain counted when a specialized quota rejects a request. A database/configuration error instead fails closed with HTTP 503. No provider calls, file storage writes, invoice reservations or domain mutations occur after an admission rejection.

Inactive rows expire after 24 hours. Every admission RPC performs indexed cleanup of at most 100 expired rows using `FOR UPDATE SKIP LOCKED`. This bounds hot-path cleanup and avoids contention between instances. When idle, expired rows can remain until traffic resumes; `cleanup_api_rate_limits()` is also available to trusted maintenance. Auth-user deletion cascades counter cleanup. No new cron job is required.

The table has RLS enabled and no browser policy. Counter and cleanup RPC execution is revoked from PUBLIC, anon and authenticated, granted only to service_role. All new functions use `SECURITY INVOKER` with an empty search path. The database validates policy names and numeric bounds independently of TypeScript. No schema permission was weakened.

## AI migration and compatibility

Migration `20261106215714_api_rate_limits.sql` locks the legacy AI counter while importing current-minute usage, aggregated by memberships' Auth user IDs. It replaces only the `ai_allow` branch of the existing provider-store function; provider invoice/webhook/audit bookkeeping is retained. The old per-actor counter table is removed after the function is replaced. Old Edge releases continue receiving the original boolean result. New releases request detailed admission/retry information. Thus mixed old/new instances share the same Auth-user counter without double charging AI requests. Current-minute usage is preserved conservatively if the aggregate already exceeds ten.

Both brief and revision generation use the shared leaf limiter; workspace commands use the same `ai_allow` once. Authorization still precedes every provider call. Structured output validation, cited scope checks and `ai_run` audit records are unchanged. Provider HTTP 429 responses expose sanitized messages and a validated numeric Retry-After, with a 60-second fallback. No raw provider payload, stack trace or credential is returned.

## Responses and frontend behavior

An exceeded application quota returns HTTP 429, `Retry-After: <positive integer seconds>` and compatible old/new JSON fields:

```json
{
  "ok": false,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again shortly.",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again shortly."
  }
}
```

Retry-After is exposed through CORS. Counter/configuration failure returns 503 `RATE_LIMIT_UNAVAILABLE` and a five-second retry hint. The existing UI receives a typed error with status/retry information; API and XHR-upload messages show the wait time. React Query does not automatically retry 429/503 errors. Payment operations retain their existing explicit user-action flow and are not automatically retried. No unrelated component was redesigned.

## Configuration and deployment

All settings are optional **Edge Function server secrets**, never VITE variables. Unset settings use the defaults above. Values must contain only positive integer digits, without whitespace, decimal/exponential forms, zero or negative values. Invalid settings fail closed. See `supabase/functions/.env.example`.

| Server variable | Default | Maximum |
| --- | ---: | ---: |
| `RATE_LIMIT_API_PER_MINUTE` | 120 | 10000 |
| `RATE_LIMIT_PAYMENT_ISSUE_PER_MINUTE` | 5 | 100 |
| `RATE_LIMIT_PAYMENT_RECONCILE_PER_MINUTE` | 10 | 100 |
| `RATE_LIMIT_PAYMENT_VERIFY_PER_MINUTE` | 5 | 100 |
| `RATE_LIMIT_UPLOAD_PER_MINUTE` | 10 | 100 |
| `RATE_LIMIT_AI_PER_MINUTE` | 10 | 100 |
| `RATE_LIMIT_PAYMENT_ISSUE_PROJECT_PER_MINUTE` | 2 | 20 |
| `RATE_LIMIT_PAYMENT_RECONCILE_PROJECT_PER_MINUTE` | 5 | 30 |

After review, apply the new migration **transactionally, before deploying new Edge code**. The pinned Supabase CLI is v2.122.0; inspect commands with `--help` and verify the intended target/profile before applying anything. Then deploy `crew-api` and build/deploy the frontend to expose retry messages. The shared backend error helper is compatible with the webhook/reconciliation functions; deploy those shared updates together if desired, preserving their JWT/service configuration. Do not change PayPal's sandbox-only base URL, webhook identity or provider secrets.

Deploying new functions before the migration will fail closed because the required RPC/result format is unavailable. Rolling back Edge code after the migration is supported: legacy `ai_allow` callers still receive booleans and use the shared quota. Do not roll back the database while new functions are serving traffic. The change does not alter financial records, accepted agreements or existing application RLS.

Suggested staging verification: sign in as two synthetic users; use temporarily low server limits; verify one user's 429 does not block the other, observe Retry-After, confirm no provider call after denial, restore normal limits, and exercise the normal workflow. Do not load-test production.

## Verification and limitations

See [verification results](api-rate-limiting-verification.md) for executed checks and their scope. `npm run test:rate-limits:db` creates an isolated PostgreSQL 17 Docker container, runs bounded independent-session concurrency tests and removes only the labeled container it created. It cannot target a remote database. Add `--advisors` directly to the script to run Supabase's security advisor through a temporary loopback-only port.

Fixed windows permit bursts around minute boundaries; this is intentional and documented, not a rolling bandwidth allowance. Upload attempt limits do not add a byte-per-hour quota; the existing actual-stream and file-size bounds remain authoritative. Limits do not replace invoice leases, idempotency, RLS or webhook verification. Counter storage is a deliberate availability dependency, and sensitive work fails closed on failure. Quota settings on mixed old/new deployments should remain at defaults until rollout finishes because old AI instances use the compatibility default of ten.

Hosted regression tests ran against the unchanged deployment. The new migration and limiter have not been applied to a hosted Supabase project, so hosted end-to-end enforcement remains a staging/deployment verification step.

Ordinary requests add one counter RPC, with any endpoint-specific user quota bundled into it. AI requests add the existing leaf-admission RPC; payment issue/reconcile add a project-admission RPC. Cleanup work is bounded within those transactions. Hosted latency has not been benchmarked before deployment.

## Files changed

| Area | Files |
| --- | --- |
| Database | `supabase/migrations/20261106215714_api_rate_limits.sql` |
| Admission and responses | `shared/rate-limits.ts`, `supabase/functions/_shared/rate-limit.ts`, `supabase/functions/_shared/backend.ts`, `supabase/functions/crew-api/index.ts` |
| AI compatibility and provider errors | `supabase/functions/_shared/ai.ts`, `supabase/functions/_shared/workspace-ai.ts`, `shared/ai-errors.ts`, `shared/gemini.ts` |
| Frontend retry handling | `shared/http-errors.ts`, `src/services.ts`, `src/fileService.ts`, `src/main.tsx` |
| Configuration and commands | `supabase/functions/.env.example`, `package.json`, `vite.config.ts`, `playwright.config.ts`, `scripts/verify-rate-limits.mjs` |
| Tests | `tests/rateLimits.test.ts`, `tests/rateLimitsDatabase.test.ts`, `tests/rateLimitHandler.test.ts`, `tests/webhookRateIsolation.test.ts`, `e2e/rate-limits.spec.ts`, restored `e2e/smoke.spec.ts`, `e2e/workspace.spec.ts`, `e2e/extended-workflows.spec.ts` |
| Handoff | `README.md`, this report, `docs/api-rate-limiting-verification.md` |
