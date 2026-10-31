import { describe, expect, it } from "vitest";
import {
  serializeWebhookVerification,
  webhookInvoiceId,
  webhookVerification,
} from "../shared/webhook-verification";
const values = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url":
    "https://api.sandbox.paypal.com/v1/notifications/certs/TEST",
  "paypal-transmission-id": "synthetic-transmission",
  "paypal-transmission-sig": "synthetic-signature",
  "paypal-transmission-time": "2026-11-01T00:00:00Z",
};
describe("PayPal signature verification boundary", () => {
  it.each([{ id: "INV2-ABCDE-12345" }, {
    invoice: { id: "INV2-ABCDE-12345" },
  }])(
    "accepts the invoice ID from flat and genuine wrapped invoice resources",
    (resource) => {
      expect(webhookInvoiceId(resource)).toBe("INV2-ABCDE-12345");
    },
  );
  it("rejects conflicting invoice identities", () => {
    expect(
      webhookInvoiceId({
        id: "INV2-ABCDE-12345",
        invoice: { id: "INV2-OTHER-12345" },
      }),
    ).toBeNull();
  });
  it.each([null, {}, { id: "CAPTURE-12345" }, {
    invoice: { id: "INV2-../../secrets" },
  }])("rejects missing or invalid invoice resources", (resource) => {
    expect(webhookInvoiceId(resource)).toBeNull();
  });
  it("preserves signed JSON whitespace, escapes and numeric spelling in the verification envelope", () => {
    const raw =
      '{\n  "id": "test", "resource": { "amount": 1.00, "label": "\\u0041" }\n}';
    const payload = webhookVerification(
      new Headers(values),
      "server-registration",
      JSON.parse(raw),
    )!;
    const serialized = serializeWebhookVerification(payload, raw);
    expect(serialized).toContain('"webhook_event":' + raw);
    expect(JSON.parse(serialized).webhook_event).toEqual(JSON.parse(raw));
    expect(JSON.parse(serialized).webhook_id).toBe("server-registration");
  });
  it.each(Object.keys(values))("rejects a callback missing %s", (name) => {
    const headers = new Headers(values);
    headers.delete(name);
    expect(webhookVerification(headers, "registered-id", {})).toBeNull();
  });
  it("rejects missing registration and blank signature", () => {
    expect(webhookVerification(new Headers(values), "", {})).toBeNull();
    const headers = new Headers(values);
    headers.set("paypal-transmission-sig", " ");
    expect(webhookVerification(headers, "registered-id", {})).toBeNull();
  });
  it("uses the server registration and preserves the entire event for PayPal", () => {
    const event = {
      id: "test",
      webhook_id: "forged-body-id",
      resource: { id: "INV2-TEST", status: "PAID" },
    };
    const result = webhookVerification(
      new Headers(values),
      "server-registration",
      event,
    );
    expect(result?.webhook_id).toBe("server-registration");
    expect(result?.webhook_event).toBe(event);
    expect(result?.transmission_sig).toBe(values["paypal-transmission-sig"]);
  });
});
