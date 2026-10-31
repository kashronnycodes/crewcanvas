import { z } from "zod";
import {
  admin,
  body,
  env,
  errorResponse,
  HttpError,
  providerStore,
  respond,
} from "../_shared/backend.ts";
import { paypal, processWebhookEvent } from "../_shared/paypal.ts";
import { webhookVerification } from "../../../shared/webhook-verification.ts";
const eventSchema = z
  .object({
    id: z.string().min(1).max(100),
    event_type: z.string().min(1),
    resource: z.object({ id: z.string().optional() }).passthrough(),
  })
  .passthrough();
export async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return respond(req, { error: { message: "POST required" } }, 405);
  }
  try {
    const raw = await body(req);
    const event = eventSchema.parse(raw);
    const payload = webhookVerification(req.headers, "header-check", raw);
    if (!payload) {
      throw new HttpError(400, "BAD_SIGNATURE", "PayPal signature headers are required.");
    }
    payload.webhook_id = env("PAYPAL_WEBHOOK_ID");
    const verification = await paypal(
      "/v1/notifications/verify-webhook-signature",
      payload,
    );
    if (verification.verification_status !== "SUCCESS") {
      throw new HttpError(
        400,
        "BAD_SIGNATURE",
        "Webhook signature could not be verified.",
      );
    }
    if (!event.event_type.startsWith("INVOICING.INVOICE.")) {
      return respond(req, { ignored: true });
    }
    if (!event.resource.id?.startsWith("INV2-")) {
      throw new HttpError(
        400,
        "INVALID_EVENT",
        "No invoice identifier in the event.",
      );
    }
    const connection = await admin().rpc("configured_sandbox_seller", {
      p_merchant_id: env("PAYPAL_MERCHANT_ID"),
      p_email: env("PAYPAL_SELLER_EMAIL"),
    });
    if (connection.error || !connection.data) {
      throw new HttpError(
        503,
        "NOT_CONFIGURED",
        "Configure the sandbox seller before registering webhooks.",
      );
    }
    const stored = await providerStore("webhook_insert", {
      eventId: event.id,
      sellerConnectionId: connection.data,
      providerId: event.resource.id,
      event,
    });
    if (stored.processed_at) return respond(req, { duplicate: true });
    try {
      await processWebhookEvent(stored);
    } catch (error) {
      await providerStore("webhook_error", {
        eventId: event.id,
        error: error instanceof Error ? error.message : "Reconciliation failed",
      });
      console.error("Webhook queued for scheduled reconciliation", event.id);
    }
    // Acknowledge only after verified receipt is durable. The scheduler retries
    // incomplete records even if PayPal has received this successful response.
    return respond(req, { received: true });
  } catch (error) {
    return errorResponse(req, error);
  }
}
Deno.serve(handler);
