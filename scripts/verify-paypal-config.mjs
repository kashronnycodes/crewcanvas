// Authenticate the Sandbox app only. Never create invoices or move money.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { projectClient, projectUrl } from "./project-client.mjs";
import assert from "node:assert/strict";
const fixtures = JSON.parse(
  readFileSync(
    new URL("../.supabase/integration-results.json", import.meta.url),
    "utf8",
  ),
);
assert.equal(fixtures.projectRef, "tsnwowlyrlxpwwetmxns");
const { admin, publicKey } = projectClient();
async function check(account, expected) {
  assert.match(
    account.email,
    /^crewcanvas\.(employer|freelancer)\.[0-9]+@example\.com$/,
  );
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: account.email,
  });
  if (link.error) {
    throw new Error("Could not start the labeled test-account session.");
  }
  const client = createClient(projectUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const session = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.data.properties.hashed_token,
  });
  if (session.error) throw new Error("Test-account authentication failed.");
  try {
    const response = await fetch(
      `${projectUrl}/functions/v1/crew-api/payments/verify-configuration`,
      {
        method: "POST",
        headers: {
          apikey: publicKey,
          Authorization: `Bearer ${session.data.session.access_token}`,
          "X-Workspace-Id": fixtures.workspaceId,
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:5173",
        },
        body: "{}",
      },
    );
    const value = await response.json();
    assert.equal(
      response.status,
      expected,
      value.error?.message ?? "Unexpected provider-check response",
    );
    return value;
  } finally {
    await client.auth.signOut();
  }
}
await check(fixtures.accounts[1], 403);
const result = await check(fixtures.accounts[0], 200);
assert.equal(result.environment, "sandbox");
assert.equal(result.credentialsValid, true);
writeFileSync(
  new URL("../.supabase/paypal-credential-check.json", import.meta.url),
  JSON.stringify({ testedAt: new Date().toISOString(), ...result }, null, 2),
);
console.log(
  "PASS employer-only configuration check; actual PayPal Sandbox OAuth credentials verified. No invoice or payment was created.",
);
