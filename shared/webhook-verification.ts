// PayPal performs cryptographic verification; a missing transmission header
// must never turn into an authenticated callback or a persisted inbox event.
export function webhookVerification(headers: Headers, webhookId: string, event: unknown) {
  const fields = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
  };
  if (!webhookId.trim() || Object.values(fields).some((value) => !value?.trim())) return null;
  return { ...fields, webhook_id: webhookId, webhook_event: event };
}
