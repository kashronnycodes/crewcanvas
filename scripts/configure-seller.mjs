import { projectClient } from "./project-client.mjs";
import { randomUUID } from "node:crypto";
const workerId = process.env.CREW_SELLER_MEMBERSHIP_ID,
  merchantId = process.env.PAYPAL_MERCHANT_ID,
  email = process.env.PAYPAL_SELLER_EMAIL;
if (!workerId || !merchantId || !email) {
  throw new Error(
    "Set CREW_SELLER_MEMBERSHIP_ID, PAYPAL_MERCHANT_ID and PAYPAL_SELLER_EMAIL in your shell. These identify the single supported Sandbox seller.",
  );
}
const { admin } = projectClient();
const member = await admin.from("memberships").select(
  "id,workspace_id,access_role",
).eq("id", workerId).single();
if (member.error || member.data.access_role !== "worker") {
  throw new Error("Choose an existing CrewCanvas freelancer membership.");
}
const existing = await admin.rpc("provider_store", {
  p_action: "seller",
  p_payload: { workerId },
});
if (existing.error) throw existing.error;
const configured = await admin.rpc("configured_sandbox_seller", {
  p_merchant_id: merchantId,
  p_email: email,
});
if (
  !configured.error && configured.data && configured.data !== existing.data?.id
) {
  throw new Error(
    "This Sandbox seller is already mapped to another membership. Refusing an ambiguous second mapping.",
  );
}
if (
  existing.data &&
  (existing.data.merchant_id !== merchantId ||
    existing.data.email.toLowerCase() !== email.toLowerCase())
) {
  throw new Error(
    "Existing seller differs. Refusing to overwrite it; review the mapping first.",
  );
}
const result = await admin.rpc("provider_store", {
  p_action: "configure_seller",
  p_payload: {
    id: existing.data?.id ?? randomUUID(),
    workspaceId: member.data.workspace_id,
    workerId,
    merchantId,
    email,
  },
});
if (result.error) throw result.error;
const verified = await admin.rpc("configured_sandbox_seller", {
  p_merchant_id: merchantId,
  p_email: email,
});
if (verified.error) throw verified.error;
console.log(
  "Configured the freelancer Sandbox seller mapping. API credentials and payment verification still require the documented provider setup.",
);
