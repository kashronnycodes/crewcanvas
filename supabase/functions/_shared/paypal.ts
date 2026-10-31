import {
  activeAgreement,
  DomainError,
  paypalAmount,
  todayIn,
  uid,
} from "../../../shared/domain.ts";
import {
  normalizeInvoice,
  type PayPalInvoice,
} from "../../../shared/paypal-state.ts";
import type { Invoice, Project, SessionActor } from "../../../shared/types.ts";
import {
  admin,
  authorizedProject,
  commit,
  env,
  HttpError,
  loadProject,
  providerStore,
} from "./backend.ts";
const BASE = "https://api-m.sandbox.paypal.com";
let tokenCache: { token: string; expires: number } | null = null;
async function token() {
  if (tokenCache && tokenCache.expires > Date.now() + 60000) {
    return tokenCache.token;
  }
  const response = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Basic ${
        btoa(`${env("PAYPAL_CLIENT_ID")}:${env("PAYPAL_CLIENT_SECRET")}`)
      }`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new HttpError(
      502,
      "PAYPAL_AUTH",
      "PayPal sandbox credentials could not be verified.",
    );
  }
  tokenCache = {
    token: result.access_token,
    expires: Date.now() + result.expires_in * 1000,
  };
  return tokenCache.token;
}
export async function paypal(
  path: string,
  data?: unknown,
  requestId?: string,
): Promise<any> {
  const response = await fetch(`${BASE}${path}`, {
    method: data === undefined ? "GET" : "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : {};
  if (!response.ok) {
    console.error(
      "PayPal request failed",
      response.status,
      result.name,
      result.debug_id,
    );
    throw new HttpError(
      502,
      "PAYPAL_ERROR",
      `PayPal sandbox could not complete this operation (${
        result.name ?? response.status
      }). Refresh the status before retrying.`,
    );
  }
  return result;
}
export async function verifySandboxCredentials() {
  await token();
  return { environment: "sandbox", credentialsValid: true };
}
async function sellerFor(p: Project) {
  const seller = await providerStore("seller", { workerId: p.workerId });
  if (
    !seller ||
    seller.environment !== "sandbox" ||
    seller.merchant_id !== env("PAYPAL_MERCHANT_ID") ||
    seller.email !== env("PAYPAL_SELLER_EMAIL")
  ) {
    throw new DomainError(
      "FORBIDDEN",
      "This worker has no configured sandbox seller. Only the configured freelancer can issue invoices.",
    );
  }
  return seller;
}
function billableCharges(p: Project) {
  const a = activeAgreement(p)!;
  const approved = p.proposals.filter(
    (x) => x.status === "accepted" && BigInt(x.amountMinor) > 0n,
  );
  const additions = approved.reduce((s, x) => s + BigInt(x.amountMinor), 0n);
  const base = BigInt(a.amountMinor) - additions;
  if (base < 0n) {
    throw new DomainError("CONFLICT", "The agreed charges need review.");
  }
  return [
    { id: `base:${p.id}`, label: p.title, amount: base.toString() },
    ...approved.map((x) => ({
      id: x.id,
      label: x.description,
      amount: x.amountMinor,
    })),
  ];
}
export async function issueInvoice(
  projectId: string,
  user: SessionActor,
  requestId: string,
) {
  let p = await authorizedProject(projectId, user);
  if (user.role !== "worker" || user.id !== p.workerId) {
    throw new DomainError(
      "FORBIDDEN",
      "Only the assigned worker can issue their invoice.",
    );
  }
  if (p.origin !== "sandbox") {
    throw new DomainError(
      "FORBIDDEN",
      "Sample projects cannot create PayPal invoices. Create a new project for the connected seller.",
    );
  }
  if (p.state !== "accepted") {
    throw new DomainError(
      "CONFLICT",
      "Accept the current delivery before invoicing.",
    );
  }
  const seller = await sellerFor(p);
  const agreement = activeAgreement(p)!;
  let invoice = p.invoices.find(
    (i) => !i.providerId || i.state === "draft" || i.error,
  );
  if (!invoice) {
    const billed = new Set(p.invoices.flatMap((i) => i.chargeIds));
    const charges = billableCharges(p).filter(
      (x) => !billed.has(x.id) && BigInt(x.amount) > 0n,
    );
    if (!charges.length) {
      throw new DomainError(
        "CONFLICT",
        "All accepted charges are already invoiced.",
      );
    }
    const id = uid();
    const accepted = p.deliveries.filter((d) => d.status === "accepted").at(-1);
    const due = new Date(
      accepted?.acceptedAt ?? accepted?.submittedAt ?? new Date().toISOString(),
    );
    const acceptance = [...p.activity]
      .reverse()
      .find((e) => e.text.startsWith("Accepted "));
    if (acceptance) due.setTime(new Date(acceptance.createdAt).getTime());
    due.setUTCDate(due.getUTCDate() + agreement.paymentDays);
    invoice = {
      id,
      sellerConnectionId: seller.id,
      providerId: null,
      number: `CC-${id.replaceAll("-", "").slice(0, 20)}`,
      amountMinor: charges
        .reduce((s, c) => s + BigInt(c.amount), 0n)
        .toString(),
      paidMinor: "0",
      pendingMinor: "0",
      dueDate: todayIn("Asia/Manila", due),
      state: "draft",
      rawStatus: "CREATION_RESERVED",
      recipientUrl: null,
      source: "sandbox",
      chargeIds: charges.map((c) => c.id),
      syncedAt: new Date().toISOString(),
    };
    p.invoices.push(invoice);
    p.version++;
    await commit(p, user, p.version - 1, requestId);
    p = await loadProject(p.id);
    invoice = p.invoices.find((i) => i.id === id)!;
  }
  const invoiceId = invoice.id;
  const leaseToken = uid();
  const lease = await providerStore("lease", { invoiceId, token: leaseToken });
  if (!lease) {
    throw new DomainError(
      "CONFLICT",
      "This invoice is already being processed. Refresh its status shortly.",
    );
  }
  try {
    if (!invoice.providerId) {
      if (invoice.rawStatus === "CREATION_UNKNOWN") {
        await recoverInvoice(p, invoice, user);
        p = await loadProject(p.id);
        invoice = p.invoices.find((i) => i.id === invoiceId)!;
        if (!invoice.providerId) {
          throw new HttpError(
            409,
            "RECONCILIATION_REQUIRED",
            "Invoice creation has an uncertain outcome. It has not been recreated. Check PayPal or refresh reconciliation.",
          );
        }
      } else {
        invoice.rawStatus = "CREATION_UNKNOWN";
        p.version++;
        await commit(p, user, p.version - 1);
        const charges = billableCharges(p).filter((c) =>
          invoice!.chargeIds.includes(c.id)
        );
        const result = await paypal(
          "/v2/invoicing/invoices",
          {
            detail: {
              invoice_number: invoice.number,
              reference: p.id,
              currency_code: "USD",
              note:
                "CrewCanvas sandbox — accepted project work and approved additions.",
              payment_term: {
                term_type: "DUE_ON_DATE_SPECIFIED",
                due_date: invoice.dueDate,
              },
            },
            invoicer: { email_address: seller.email },
            primary_recipients: [
              { billing_info: { email_address: env("PAYPAL_PAYER_EMAIL") } },
            ],
            items: charges.map((c) => ({
              name: c.label.slice(0, 200),
              quantity: "1",
              unit_amount: {
                currency_code: "USD",
                value: paypalAmount(c.amount),
              },
            })),
            configuration: {
              partial_payment: { allow_partial_payment: true },
              allow_tip: false,
            },
          },
          invoice.id,
        );
        const providerId = result.id ??
          (result.href ? result.href.split("/").at(-1) : result.links
            ?.find((l: { rel: string }) => l.rel === "self")
            ?.href?.split("/")
            .at(-1));
        if (!providerId || !/^INV2-[A-Z0-9-]+$/i.test(providerId)) {
          throw new HttpError(
            502,
            "PAYPAL_RESPONSE",
            "PayPal returned no usable invoice reference. Reconciliation is required before retrying.",
          );
        }
        invoice.providerId = providerId;
        invoice.rawStatus = "DRAFT";
        delete invoice.error;
        p.version++;
        await commit(p, user, p.version - 1);
      }
    }
    const current = (await paypal(
      `/v2/invoicing/invoices/${encodeURIComponent(invoice.providerId!)}`,
    )) as PayPalInvoice;
    if (current.status === "DRAFT") {
      await paypal(
        `/v2/invoicing/invoices/${
          encodeURIComponent(invoice.providerId!)
        }/send`,
        { send_to_recipient: false, send_to_invoicer: false },
        `${invoice.id}-send`,
      );
    }
    await reconcileLocked(p.id, invoiceId, user);
    return { invoiceId };
  } catch (error) {
    try {
      const latest = await loadProject(p.id);
      const stored = latest.invoices.find((i) => i.id === invoiceId)!;
      stored.error = error instanceof Error
        ? error.message
        : "PayPal needs attention.";
      latest.version++;
      await commit(latest, user, latest.version - 1);
    } catch {
      /* Preserve the original provider error; scheduled reconciliation retries. */
    }
    throw error;
  } finally {
    await providerStore("release", { invoiceId, token: leaseToken });
  }
}
async function recoverInvoice(
  p: Project,
  invoice: Invoice,
  user: SessionActor,
) {
  for (let page = 1; page <= 10; page++) {
    const listed = await paypal(
      `/v2/invoicing/invoices?page=${page}&page_size=100&total_required=true`,
    );
    const found = (listed.items ?? []).find(
      (item: PayPalInvoice) => item.detail?.invoice_number === invoice.number,
    );
    if (found) {
      invoice.providerId = found.id;
      invoice.rawStatus = found.status;
      p.version++;
      await commit(p, user, p.version - 1);
      return;
    }
    if (
      !listed.items?.length ||
      (listed.total_pages && page >= listed.total_pages)
    ) {
      break;
    }
  }
}
async function reconcileLocked(
  projectId: string,
  invoiceId: string,
  user: SessionActor,
) {
  const p = await loadProject(projectId);
  const invoice = p.invoices.find((i) => i.id === invoiceId)!;
  const seller = await sellerFor(p);
  if (!invoice.providerId) {
    await recoverInvoice(p, invoice, user);
    return;
  }
  const remote = (await paypal(
    `/v2/invoicing/invoices/${encodeURIComponent(invoice.providerId)}`,
  )) as PayPalInvoice;
  if (
    remote.detail?.reference !== p.id ||
    (remote.invoicer?.email_address &&
      remote.invoicer.email_address.toLowerCase() !==
        seller.email.toLowerCase())
  ) {
    throw new DomainError(
      "CONFLICT",
      "PayPal returned an invoice for a different project or seller.",
    );
  }
  const normalized = normalizeInvoice(remote, invoice);
  p.invoices = p.invoices.map((i) => (i.id === invoiceId ? normalized : i));
  if (
    invoice.state !== normalized.state ||
    invoice.paidMinor !== normalized.paidMinor
  ) {
    p.activity.push({
      id: uid(),
      actorId: user.id,
      text: `PayPal reconciliation: ${normalized.state}; ${
        paypalAmount(normalized.paidMinor)
      } USD settled.`,
      createdAt: new Date().toISOString(),
    });
  }
  p.version++;
  await commit(p, user, p.version - 1);
  for (const tx of remote.payments?.transactions ?? []) {
    if (tx.payment_id) {
      await providerStore("payment_record", {
        transactionId: tx.payment_id,
        invoiceId,
        data: tx,
      });
    }
  }
}
export async function reconcileProject(projectId: string, user: SessionActor) {
  const p = await authorizedProject(projectId, user);
  if (p.origin !== "sandbox") {
    throw new DomainError(
      "FORBIDDEN",
      "Sample payments do not have a PayPal state.",
    );
  }
  await sellerFor(p);
  for (const invoice of p.invoices) {
    const leaseToken = uid();
    if (
      !(await providerStore("lease", {
        invoiceId: invoice.id,
        token: leaseToken,
      }))
    ) {
      throw new DomainError(
        "CONFLICT",
        "Invoice reconciliation is already running. Retry shortly.",
      );
    }
    try {
      await reconcileLocked(p.id, invoice.id, user);
    } finally {
      await providerStore("release", {
        invoiceId: invoice.id,
        token: leaseToken,
      });
    }
  }
}
export async function processWebhookEvent(event: any) {
  const row = await admin()
    .from("invoices")
    .select("project_id")
    .eq("provider_id", event.invoice_provider_id)
    .maybeSingle();
  if (row.error) throw row.error;
  if (!row.data) {
    throw new HttpError(
      409,
      "WAITING_FOR_INVOICE",
      "Waiting for the invoice reference to be saved.",
    );
  }
  const p = await loadProject(row.data.project_id);
  await reconcileProject(p.id, {
    id: p.workerId,
    role: "worker",
    workspaceId: p.workspaceId,
  });
  await providerStore("webhook_done", { eventId: event.event_id });
}
