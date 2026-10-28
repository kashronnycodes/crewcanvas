import { describe, expect, it } from "vitest";
import { activeAgreement, execute, uid } from "../shared/domain";
import { IDS, seedWorkspace } from "../shared/seed";
import { normalizeInvoice } from "../shared/paypal-state";
const employer = {
  id: IDS.myron,
  role: "employer" as const,
  workspaceId: IDS.workspace,
};
const worker = {
  id: IDS.ava,
  role: "worker" as const,
  workspaceId: IDS.workspace,
};
describe("revision and payment edge cases", () => {
  it("does not generate a fee when included rounds are exhausted, and supports an explicit round waiver", () => {
    let p = seedWorkspace().projects[0];
    p.agreements[0].revisionRounds = 0;
    p = execute(
      p,
      {
        type: "submitDelivery",
        projectId: p.id,
        url: "https://drive.google.com/file/d/test",
        label: "v1",
        note: "",
      },
      worker,
    );
    p = execute(
      p,
      {
        type: "requestRevision",
        projectId: p.id,
        text: "Fix the spelling",
        items: [
          {
            text: "Fix the spelling",
            classification: "likely_included",
            explanation: "Correction",
            uncertainty: "low",
            sources: [],
          },
        ],
      },
      employer,
    );
    const r = p.revisions[0];
    const response = {
      type: "respondRevision" as const,
      projectId: p.id,
      revisionId: r.id,
      itemId: r.items[0].id,
      disposition: "included" as const,
      note: "",
      waiveRound: false,
    };
    expect(() => execute(p, response, worker)).toThrow("No included rounds");
    p = execute(p, { ...response, waiveRound: true }, worker);
    expect(activeAgreement(p)!.amountMinor).toBe("12000");
    expect(p.proposals).toHaveLength(0);
    expect(p.revisions[0].roundConsumed).toBe(false);
  });
  it("supports worker rebasing without approving or changing the amount", () => {
    let p = seedWorkspace().projects.find((p) => p.workerId === IDS.ethan)!;
    const old = p.proposals[0];
    old.baseAgreementId = uid();
    p = execute(
      p,
      { type: "rebaseProposal", projectId: p.id, proposalId: old.id },
      { id: IDS.ethan, role: "worker", workspaceId: IDS.workspace },
    );
    expect(p.proposals[0].status).toBe("superseded");
    expect(p.proposals[1].status).toBe("pending");
    expect(p.proposals[1].baseAgreementId).toBe(p.activeAgreementId);
    expect(activeAgreement(p)!.amountMinor).toBe("8000");
  });
  it("bases the invoice due date on delivery acceptance, not later invoice creation", () => {
    let p = seedWorkspace().projects[0];
    p = execute(
      p,
      {
        type: "submitDelivery",
        projectId: p.id,
        url: "https://drive.google.com/file/d/test",
        label: "v1",
        note: "",
      },
      worker,
      { now: "2026-10-01T04:00:00Z" },
    );
    p = execute(
      p,
      {
        type: "acceptDelivery",
        projectId: p.id,
        deliveryId: p.deliveries[0].id,
      },
      employer,
      { now: "2026-10-02T04:00:00Z" },
    );
    p = execute(p, { type: "simulateInvoice", projectId: p.id }, worker, {
      demo: true,
      now: "2026-10-05T04:00:00Z",
    });
    expect(p.invoices[0].dueDate).toBe("2026-10-09");
  });
  it("keeps confirmed partial funds settled while the remainder is pending", () => {
    const i = seedWorkspace().projects.find((p) => p.workerId === IDS.leo)!
      .invoices[0];
    i.providerId = "INV2-TEST";
    const result = normalizeInvoice(
      {
        id: "INV2-TEST",
        status: "PAYMENT_PENDING",
        amount: { value: "150.00", currency_code: "USD" },
        due_amount: { value: "100.00", currency_code: "USD" },
      },
      i,
    );
    expect(result.paidMinor).toBe("5000");
    expect(result.pendingMinor).toBe("10000");
    expect(result.state).toBe("pending");
  });
  it("does not count external manual payment records as verified PayPal settlement", () => {
    const i = seedWorkspace().projects.find((p) => p.workerId === IDS.leo)!
      .invoices[0];
    i.providerId = "INV2-TEST";
    const result = normalizeInvoice(
      {
        id: "INV2-TEST",
        status: "PAID",
        amount: { value: "150.00", currency_code: "USD" },
        due_amount: { value: "0.00", currency_code: "USD" },
        payments: {
          transactions: [
            {
              type: "EXTERNAL",
              amount: { value: "150.00", currency_code: "USD" },
            },
          ],
        },
      },
      i,
    );
    expect(result.state).toBe("unknown");
    expect(result.paidMinor).toBe("0");
  });
});
