# Production preflight — 1 November 2026

The owner conditionally authorized merging PR #1 and deploying the integrated
application to `https://crewcanvas.vercel.app` once essential security,
authentication, payment and environment checks pass. A complete two-person
browser rehearsal may follow deployment for the four-person hackathon team.

## Passed

- Integration head `1e5cbbae15939faf7a0dfa3467aa77bef53431c7` contains the verified
  Gemini migration. PR #1 is mergeable and main is an ancestor of the branch.
  GitHub CI and the branch preview deployment passed at that head.
- Fresh local verification: 109 tests in 17 files, TypeScript/Vite production
  build and all three Edge Function type checks passed.
- Fresh hosted workflow verification: all 13 integration groups passed using
  new synthetic users, including workspace invitations, roles and isolation,
  assignment, canvas persistence, private uploads and version history,
  revision/resubmission/approval, notifications and sign-out.
- All eight live AI verification groups passed using Gemini. All eight endpoint
  security groups passed, including forged webhook and unauthorized
  reconciliation rejection. Provider credentials remain server-side.
- The existing USD 1.25 Sandbox invoice remains paid: 125 cents settled,
  zero pending. No new invoice or payment was created for this preflight.
  The previously verified signed paid event and unique transaction are retained.
- Vercel production settings were missing and have now been configured:
  integrated mode, the exact `tsnwowlyrlxpwwetmxns` URL, and its matching
  publishable key. A direct cloud verification of only those three public
  values passed in memory, independently of local environment files. No provider
  or service-role credential was configured in Vercel.
- The production origin is already allowed by backend CORS and Auth redirect
  configuration. A fresh production-origin preflight and authenticated real
  Gemini summary both passed. A prepared remote-config diff changes only Auth `site_url`
  from the immutable preview URL to `https://crewcanvas.vercel.app`; it has
  **not** been applied.

## Deployment gate

Email confirmations are enabled but Custom SMTP is disabled, as confirmed in
the hosted CrewCanvas Auth settings. Supabase's default sender only supports
organization-member addresses. New teammates may therefore be unable to
confirm their accounts. Do not disable confirmations to bypass this issue:
workspace invitations require a verified matching email address.

Before merging/deploying, either configure a supported SMTP provider or obtain
the owner's confirmation that all four team members already have confirmed
CrewCanvas accounts and will use existing sign-ins for this limited team test.
SMTP remains a public-signup launch requirement in the latter case.

No merge or production deployment has been performed. The current production
site remains the original demo deployment.

## Remaining launch work

- Set production Auth `site_url` after the authentication gate is resolved;
  preserve the existing exact production/preview/localhost redirect entries.
- Complete the owner-authorized release, then verify the actual production
  bundle, authenticated persistence, Gemini output, uploads/revisions and
  desktop/mobile presentation. Inspect new deployment/backend errors.
- Complete the team's manual employer/freelancer rehearsal. The broader
  16-case AI quality evaluator remains separate from the passing targeted
  regression and live security suites.
- The single Sandbox merchant is currently mapped to a retained synthetic
  freelancer membership. Arbitrary new teammate memberships cannot issue
  invoices until seller mapping/onboarding is reviewed. Preserve paid fixture
  history and do not silently reassign the existing merchant.
- Supabase advises enabling leaked-password protection and reports managed
  `pg_net` in `public`. Neither is an advisor ERROR. Review plan availability
  for leaked-password protection; do not force-relocate the non-relocatable
  managed extension or disrupt reconciliation.

## Release and rollback

1. Resolve the authentication gate. Inspect the Auth diff and apply only the
   intended production `site_url` change.
2. Commit the final report/helpers, push, and require passing CI at the exact
   merge head. Mark PR #1 ready and merge with an expected-head SHA guard.
3. Monitor Vercel's main-branch production deployment. Confirm its source SHA,
   integrated build settings, Ready status and alias before testing the site.
   Do not promote an older preview with different build-time settings.
4. If critical post-deployment checks fail, restore the previous production
   deployment `dpl_Bynbx25tuQCP2dar7xD4mGiVgxpo` using Vercel rollback. Its
   immutable URL is
   `https://crewcanvas-dzjitlvfo-kashronnycodes-projects.vercel.app`.
   This restores the demo frontend without resetting the database or changing
   verified payment records. Preserve production environment settings for a
   corrected build.
5. Retain `OPENAI_API_KEY`; provider rollback remains an explicit server-side
   setting, never an automatic fallback after a failed Gemini response.

Reference: [Supabase Auth SMTP limitations](https://supabase.com/docs/guides/auth/auth-smtp).
