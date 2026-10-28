import { describe, expect, it } from "vitest";
import { normalizeInvoice, type PayPalInvoice } from "../shared/paypal-state";
import type { Invoice } from "../shared/types";
const local: Invoice = {
  id: crypto.randomUUID(),
  sellerConnectionId: "seller",
  providerId: "INV2-TEST",
  number: "CC-TEST",
  amountMinor: "15000",
  paidMinor: "0",
  pendingMinor: "0",
  dueDate: "2026-10-28",
  state: "unpaid",
  rawStatus: "UNPAID",
  recipientUrl: null,
  source: "sandbox",
  chargeIds: ["base"],
  syncedAt: new Date().toISOString(),
};
const remote = (status: string, due = "150.00"): PayPalInvoice => ({
  id: "INV2-TEST",
  status,
  amount: { currency_code: "USD", value: "150.00" },
  due_amount: { currency_code: "USD", value: due },
});
describe("provider settlement reconciliation", () => {
  it("requires full provider-confirmed settlement", () => {
    expect(normalizeInvoice(remote("PAID", "0.00"), local)).toMatchObject({
      state: "paid",
      paidMinor: "15000",
    });
    expect(normalizeInvoice(remote("PAID"), local).state).toBe("unknown");
  });
  it("does not infer paid from an event name or pending payment", () => {
    expect(
      normalizeInvoice(remote("PAYMENT_PENDING", "0.00"), local),
    ).toMatchObject({
      state: "pending",
      paidMinor: "0",
      pendingMinor: "15000",
    });
  });
  it("preserves a partial balance accurately", () => {
    expect(
      normalizeInvoice(remote("PARTIALLY_PAID", "100.00"), local),
    ).toMatchObject({ state: "partial", paidMinor: "5000", pendingMinor: "0" });
  });
  it("does not count manually marked payments as PayPal settlement", () => {
    expect(
      normalizeInvoice(remote("MARKED_AS_PAID", "0.00"), local),
    ).toMatchObject({ state: "unknown", paidMinor: "0" });
  });
  it("rejects wrong invoices, currency, amounts, and inconsistent balances", () => {
    expect(() =>
      normalizeInvoice({ ...remote("PAID", "0.00"), id: "OTHER" }, local),
    ).toThrow();
    expect(() =>
      normalizeInvoice(
        { ...remote("PAID"), amount: { value: "1.00", currency_code: "USD" } },
        local,
      ),
    ).toThrow();
    expect(() =>
      normalizeInvoice(
        {
          ...remote("PAID"),
          amount: { value: "150.00", currency_code: "PHP" },
        },
        local,
      ),
    ).toThrow();
    expect(() =>
      normalizeInvoice(remote("PARTIALLY_PAID", "200.00"), local),
    ).toThrow();
  });
  it("treats unknown, cancelled, and refunded states explicitly", () => {
    expect(normalizeInvoice(remote("NEW_PROVIDER_STATE"), local).state).toBe(
      "unknown",
    );
    expect(normalizeInvoice(remote("CANCELLED"), local).state).toBe(
      "cancelled",
    );
    expect(normalizeInvoice(remote("REFUNDED"), local).state).toBe("refunded");
  });
  it("reconciliation is repeatable and uses provider state rather than event chronology", () => {
    const first = normalizeInvoice(remote("PARTIALLY_PAID", "100.00"), local);
    const completed = normalizeInvoice(remote("PAID", "0.00"), first);
    const duplicate = normalizeInvoice(remote("PAID", "0.00"), completed);
    expect(duplicate.paidMinor).toBe("15000");
    expect(duplicate.state).toBe("paid");
  });
});
