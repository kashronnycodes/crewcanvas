import { parseAmount, DomainError } from "./domain.ts";
import type { Invoice, PaymentState } from "./types.ts";
type Amount = { value: string; currency_code: string };
export interface PayPalInvoice {
  id: string;
  status: string;
  amount: Amount;
  due_amount?: Amount;
  invoicer?: { email_address?: string };
  detail?: {
    invoice_number?: string;
    reference?: string;
    metadata?: { recipient_view_url?: string };
  };
  payments?: {
    paid_amount?: Amount;
    transactions?: {
      payment_id?: string;
      transaction_id?: string;
      type?: string;
      status?: string;
      amount?: Amount;
      payment_date?: string;
    }[];
  };
  refunds?: { refund_amount?: Amount };
}
export function normalizeInvoice(
  remote: PayPalInvoice,
  local: Invoice,
): Invoice {
  if (
    remote.id !== local.providerId ||
    remote.amount?.currency_code !== "USD" ||
    parseAmount(remote.amount.value) !== local.amountMinor
  )
    throw new DomainError(
      "CONFLICT",
      "PayPal invoice identity, currency, or amount does not match the approved invoice.",
    );
  let state: PaymentState = "unknown";
  let paid = 0n;
  let pending = 0n;
  const transactions = remote.payments?.transactions ?? [];
  for (const amount of [
    remote.due_amount,
    remote.payments?.paid_amount,
    remote.refunds?.refund_amount,
  ]) {
    if (amount && amount.currency_code !== "USD")
      throw new DomainError("CONFLICT", "Unexpected PayPal balance currency.");
  }
  for (const tx of transactions) {
    if (!tx.amount) continue;
    if (tx.amount.currency_code !== "USD")
      throw new DomainError("CONFLICT", "Unexpected PayPal payment currency.");
    const amount = BigInt(parseAmount(tx.amount.value));
    if (tx.status === "PENDING") pending += amount;
    if (tx.status === "COMPLETED" || tx.status === "SUCCESS") paid += amount;
  }
  const total = BigInt(local.amountMinor);
  const raw = remote.status;
  if (["DRAFT", "SCHEDULED"].includes(raw)) state = "draft";
  else if (["SENT", "UNPAID"].includes(raw)) state = "unpaid";
  else if (raw === "PAYMENT_PENDING") {
    state = "pending";
    paid = BigInt(local.paidMinor);
    if (pending === 0n) pending = total - paid;
  } else if (raw === "PARTIALLY_PAID") {
    state = pending > 0n ? "pending" : "partial";
    if (remote.payments?.paid_amount)
      paid = BigInt(parseAmount(remote.payments.paid_amount.value));
    else if (remote.due_amount && pending === 0n)
      paid = total - BigInt(parseAmount(remote.due_amount.value));
  } else if (raw === "PAID") {
    if (
      pending === 0n &&
      remote.due_amount &&
      BigInt(parseAmount(remote.due_amount.value)) === 0n
    ) {
      state = "paid";
      paid = total;
    } else if (pending > 0n) state = "pending";
  } else if (raw === "CANCELLED") state = "cancelled";
  else if (["REFUNDED", "PARTIALLY_REFUNDED"].includes(raw)) {
    state = "refunded";
    if (remote.payments?.paid_amount && remote.refunds?.refund_amount)
      paid =
        BigInt(parseAmount(remote.payments.paid_amount.value)) -
        BigInt(parseAmount(remote.refunds.refund_amount.value));
    else if (raw === "PARTIALLY_REFUNDED") state = "unknown";
  }
  if (
    transactions.some((tx) => tx.type === "EXTERNAL") &&
    !["cancelled", "refunded"].includes(state)
  ) {
    state = "unknown";
    paid = 0n;
    pending = 0n;
  }
  // MARKED_AS_PAID is an external/manual payment, not proof of a PayPal settlement.
  if (
    transactions.some((tx) =>
      ["FAILED", "DENIED", "DECLINED"].includes(tx.status ?? ""),
    ) &&
    state !== "paid" &&
    pending === 0n &&
    paid === 0n &&
    !["cancelled", "refunded", "unknown"].includes(state)
  )
    state = "failed";
  if (paid < 0n || pending < 0n || paid + pending > total)
    throw new DomainError(
      "CONFLICT",
      "PayPal returned inconsistent settlement amounts.",
    );
  const link = remote.detail?.metadata?.recipient_view_url;
  const safeLink =
    link &&
    new URL(link).protocol === "https:" &&
    ["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(
      new URL(link).hostname,
    )
      ? link
      : local.recipientUrl;
  return {
    ...local,
    state,
    paidMinor: paid.toString(),
    pendingMinor: pending.toString(),
    rawStatus: raw,
    recipientUrl: safeLink,
    syncedAt: new Date().toISOString(),
    error:
      state === "unknown"
        ? "This provider state needs review; it is not confirmed paid."
        : undefined,
  };
}
