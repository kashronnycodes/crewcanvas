// Negative live checks only: no successful provider event or money mutation.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { projectClient, projectUrl } from "./project-client.mjs";
import { testSession } from "./test-session.mjs";
const { publicKey } = projectClient();
const session = await testSession(0);
const passed = [];
const check = (name) => {
  passed.push(name);
  console.log(`PASS ${name}`);
};
async function post(path, headers = {}, data = {}) {
  const response = await fetch(`${projectUrl}/functions/v1/${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
  return { status: response.status, data: await response.json() };
}
try {
  const auth = await session.client.auth.getSession();
  for (
    const path of [
      "reconcile",
      "reconcile/configure-seller",
      "reconcile/webhook-check",
      "reconcile/ai-probe",
      "reconcile/webhook-events",
    ]
  ) {
    for (
      const headers of [{}, { apikey: publicKey }, {
        apikey: publicKey,
        Authorization: `Bearer ${auth.data.session.access_token}`,
      }]
    ) {
      const result = await post(path, headers);
      assert.equal(
        result.status,
        401,
        `${path} must require a server credential`,
      );
    }
    check(`${path} rejects anonymous, public-key and signed-in app callers`);
  }
  const malformed = await post("paypal-webhook");
  assert.equal(malformed.status, 400);
  assert.equal(malformed.data.error.code, "VALIDATION");
  check("webhook rejects malformed event");
  const event = {
    id: "CREWCANVAS-FORGED-SIGNATURE-SECURITY-CHECK",
    event_type: "INVOICING.INVOICE.PAID",
    resource: { id: "INV2-SYNTHETIC-UNSIGNED" },
  };
  const unsigned = await post("paypal-webhook", {}, event);
  assert.equal(unsigned.status, 400);
  assert.equal(unsigned.data.error.code, "BAD_SIGNATURE");
  check("public webhook rejects unsigned invoice event before processing");
  const forged = await post("paypal-webhook", {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url":
      "https://api.sandbox.paypal.com/v1/notifications/certs/SYNTHETIC-NOT-A-CERT",
    "paypal-transmission-id": "synthetic-forged-transmission",
    "paypal-transmission-sig": "Zm9yZ2Vk",
    "paypal-transmission-time": new Date().toISOString(),
  }, event);
  assert.ok(
    [400, 502].includes(forged.status),
    "Invalid provider verification must fail closed",
  );
  assert.ok(
    ["BAD_SIGNATURE", "PAYPAL_ERROR"].includes(forged.data.error?.code),
  );
  check("forged signature fails closed through actual PayPal verification API");
} finally {
  await session.close();
  writeFileSync(
    new URL("../.supabase/endpoint-security.json", import.meta.url),
    JSON.stringify({ testedAt: new Date().toISOString(), passed }, null, 2),
  );
}
