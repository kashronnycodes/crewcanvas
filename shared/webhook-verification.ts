// PayPal performs cryptographic verification; a missing transmission header
// must never turn into an authenticated callback or a persisted inbox event.
export function webhookVerification(
  headers: Headers,
  webhookId: string,
  event: unknown,
) {
  const fields = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
  };
  if (
    !webhookId.trim() || Object.values(fields).some((value) => !value?.trim())
  ) return null;
  return { ...fields, webhook_id: webhookId, webhook_event: event };
}

export function serializeWebhookVerification(
  payload: NonNullable<ReturnType<typeof webhookVerification>>,
  rawEvent: string,
) {
  const { webhook_event: _event, ...metadata } = payload;
  // The handler validates rawEvent as JSON first. Preserve its original bytes
  // inside the verification envelope, including whitespace and number spelling.
  return JSON.stringify(metadata).slice(0, -1) + ',"webhook_event":' +
    rawEvent + "}";
}

export function webhookInvoiceId(resource: unknown): string | null {
  if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
    return null;
  }
  const value = resource as { id?: unknown; invoice?: { id?: unknown } };
  const direct = value.id, nested = value.invoice?.id;
  if (direct != null && nested != null && direct !== nested) return null;
  const id = direct ?? nested;
  return typeof id === "string" && /^INV2-[A-Z0-9-]{5,80}$/.test(id)
    ? id
    : null;
}
