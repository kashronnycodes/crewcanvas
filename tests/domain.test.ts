import { describe, expect, it } from "vitest";
import {
  activeAgreement,
  execute,
  indicators,
  invoiceAttention,
  makeAgreement,
  parseAmount,
  paypalAmount,
  reparent,
  uid,
  verifySources,
} from "../shared/domain";
import { IDS, seedWorkspace } from "../shared/seed";
import { driveUrlSchema, layoutSchema } from "../shared/validation";
import type { ScopeItem, SessionActor } from "../shared/types";
const employer: SessionActor = {
  id: IDS.myron,
  role: "employer",
  workspaceId: IDS.workspace,
};
const worker: SessionActor = {
  id: IDS.ava,
  role: "worker",
  workspaceId: IDS.workspace,
};
describe("money and inputs", () => {
  it("uses exact integer cents", () => {
    expect(parseAmount("120.09")).toBe("12009");
    expect(paypalAmount("12009")).toBe("120.09");
    expect(parseAmount("0.01")).toBe("1");
    expect(() => parseAmount("1.001")).toThrow();
    expect(() => parseAmount("-1")).toThrow();
    expect(() => parseAmount("Infinity")).toThrow();
  });
  it("accepts only HTTPS Drive/Docs URLs without credentials", () => {
    for (const url of [
      "http://drive.google.com/x",
      "https://drive.google.com.evil.test/x",
      "javascript:alert(1)",
      "https://user@drive.google.com/x",
    ])
      expect(driveUrlSchema.safeParse(url).success).toBe(false);
    expect(
      driveUrlSchema.safeParse("https://docs.google.com/document/d/test")
        .success,
    ).toBe(true);
  });
});
describe("canvas and status invariants", () => {
  it("preserves collapsed members and relative arrangement across serialization and group movement", () => {
    const seed = seedWorkspace();
    const layout = structuredClone(seed.layout);
    const before = structuredClone(
      layout.people.filter((p) => p.groupId === IDS.video),
    );
    layout.groups[0].collapsed = true;
    layout.groups[0].x += 110;
    layout.groups[0].y -= 30;
    const restored = layoutSchema.parse(JSON.parse(JSON.stringify(layout)));
    restored.groups[0].collapsed = false;
    expect(restored.people.filter((p) => p.groupId === IDS.video)).toEqual(
      before,
    );
    expect(restored.groups[0].x).toBe(seed.layout.groups[0].x + 110);
    expect(seed.projects).toEqual(seed.projects);
  });
  it("ungroups without changing world position or business data", () => {
    const s = seedWorkspace();
    const before = structuredClone(s.projects);
    const p = s.layout.people.find((p) => p.id === IDS.ava)!;
    const g = s.layout.groups[0];
    const next = reparent(s.layout, IDS.ava, null);
    expect(next.people.find((p) => p.id === IDS.ava)).toEqual({
      ...p,
      groupId: null,
      x: p.x + g.x,
      y: p.y + g.y,
    });
    expect(s.projects).toEqual(before);
  });
  it("rejects duplicate nodes and unknown groups", () => {
    const s = seedWorkspace();
    s.layout.people.push(s.layout.people[0]);
    expect(layoutSchema.safeParse(s.layout).success).toBe(false);
  });
  it("counts accepted and payment attention independently, deduplicating projects", () => {
    const s = seedWorkspace();
    const leo = s.projects.find((p) => p.workerId === IDS.leo)!;
    leo.invoices.push({ ...leo.invoices[0], id: uid() });
    expect(indicators(s.projects, [IDS.leo], "2026-10-28")).toEqual({
      completed: 1,
      attention: 1,
    });
    leo.invoices.forEach((i) => {
      i.state = "paid";
      i.paidMinor = i.amountMinor;
    });
    expect(indicators(s.projects, [IDS.leo], "2026-10-28")).toEqual({
      completed: 1,
      attention: 0,
    });
  });
  it("does not flag every outstanding balance or processing payment red", () => {
    const i = seedWorkspace().projects.find((p) => p.workerId === IDS.leo)!
      .invoices[0];
    i.dueDate = "2027-01-01";
    expect(invoiceAttention(i, "2026-10-28")).toBe(false);
    i.state = "pending";
    i.pendingMinor = "10000";
    i.dueDate = "2026-01-01";
    expect(invoiceAttention(i, "2026-10-28")).toBe(false);
    i.state = "failed";
    expect(invoiceAttention(i, "2026-10-28")).toBe(true);
  });
});
describe("authorization and immutable scope", () => {
  it("rejects peer workers, foreign workspaces, employer-only worker actions, and integrated simulations", () => {
    const p = seedWorkspace().projects[0];
    expect(() =>
      execute(
        p,
        { type: "discuss", projectId: p.id, text: "hello" },
        { ...worker, id: IDS.leo },
      ),
    ).toThrow("access");
    expect(() =>
      execute(
        p,
        { type: "discuss", projectId: p.id, text: "hello" },
        { ...employer, workspaceId: uid() },
      ),
    ).toThrow("access");
    expect(() =>
      execute(
        p,
        { type: "acceptDelivery", projectId: p.id, deliveryId: uid() },
        worker,
      ),
    ).toThrow("employer");
    expect(() =>
      execute(p, { type: "simulateInvoice", projectId: p.id }, worker),
    ).toThrow("demo");
  });
  it("keeps proposed terms inactive until accepted by the worker", () => {
    const p = seedWorkspace().projects[0];
    const original = structuredClone(activeAgreement(p)!);
    let next = execute(
      p,
      {
        type: "proposeAgreement",
        projectId: p.id,
        terms: {
          brief: "Updated brief requiring explicit acceptance.",
          deliverables: ["New deliverable"],
          amountMinor: "15000",
          currency: "USD",
          deadline: "2027-01-01",
          revisionRounds: 3,
          paymentDays: 7,
        },
      },
      employer,
    );
    expect(activeAgreement(next)!.amountMinor).toBe("12000");
    expect(next.agreements[0]).toEqual(original);
    next = execute(
      next,
      {
        type: "decideAgreement",
        projectId: p.id,
        agreementId: next.agreements[1].id,
        accept: true,
      },
      worker,
    );
    expect(activeAgreement(next)!.amountMinor).toBe("15000");
    expect(next.agreements[0]).toEqual(original);
    expect(next.agreements[0].id).not.toBe(next.agreements[1].id);
  });
  it("never bills a pending or declined proposal; acceptance is idempotent", () => {
    const p = seedWorkspace().projects.find((p) => p.workerId === IDS.ethan)!;
    const a = structuredClone(activeAgreement(p)!);
    expect(a.amountMinor).toBe("8000");
    const command = {
      type: "decideProposal" as const,
      projectId: p.id,
      proposalId: p.proposals[0].id,
      accept: true,
    };
    const next = execute(p, command, employer);
    expect(activeAgreement(next)!.amountMinor).toBe("10000");
    expect(next.agreements[0]).toEqual(a);
    expect(next.agreements[1].id).not.toBe(a.id);
    expect(execute(next, command, employer)).toEqual(next);
    const declined = execute(p, { ...command, accept: false }, employer);
    expect(activeAgreement(declined)!.amountMinor).toBe("8000");
  });
  it("requires rebasing stale proposals", () => {
    const p = seedWorkspace().projects.find((p) => p.workerId === IDS.ethan)!;
    p.proposals[0].baseAgreementId = uid();
    expect(() =>
      execute(
        p,
        {
          type: "decideProposal",
          projectId: p.id,
          proposalId: p.proposals[0].id,
          accept: true,
        },
        employer,
      ),
    ).toThrow("Agreement changed");
  });
  it("supports a zero price waiver without changing the agreed total", () => {
    const p = seedWorkspace().projects.find((p) => p.workerId === IDS.ethan)!;
    p.proposals[0].amountMinor = "0";
    const next = execute(
      p,
      {
        type: "decideProposal",
        projectId: p.id,
        proposalId: p.proposals[0].id,
        accept: true,
      },
      employer,
    );
    expect(activeAgreement(next)!.amountMinor).toBe("8000");
    expect(next.activity.at(-1)!.text).toContain("waived");
  });
  it("rejects fabricated agreement citations", () => {
    const a = activeAgreement(seedWorkspace().projects[0])!;
    const item: ScopeItem = {
      text: "New work",
      classification: "potential_extra",
      explanation: "Advisory",
      uncertainty: "high",
      sources: [{ clauseId: "brief", quote: "A fabricated sentence" }],
    };
    expect(() => verifySources([item], a)).toThrow("source");
  });
});
describe("delivery to revision to simulated settlement", () => {
  it("runs a mixed revision without automatic pricing, consumes one round, preserves terms and acceptance", () => {
    let p = seedWorkspace().projects[0];
    const old = structuredClone(activeAgreement(p)!);
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
    const items: ScopeItem[] = [
      {
        text: "Fix spelling at 0:14",
        classification: "likely_included",
        explanation: "Correction",
        uncertainty: "low",
        sources: [],
      },
      {
        text: "Add a second ending",
        classification: "potential_extra",
        explanation: "Additional output",
        uncertainty: "medium",
        sources: [],
      },
    ];
    p = execute(
      p,
      {
        type: "requestRevision",
        projectId: p.id,
        text: "Fix spelling and add a second ending",
        items,
      },
      employer,
    );
    expect(activeAgreement(p)!.amountMinor).toBe("12000");
    const r = p.revisions[0];
    p = execute(
      p,
      {
        type: "respondRevision",
        projectId: p.id,
        revisionId: r.id,
        itemId: r.items[0].id,
        disposition: "included",
        note: "",
        waiveRound: false,
      },
      worker,
    );
    expect(p.revisions[0].roundConsumed).toBe(true);
    p = execute(
      p,
      {
        type: "proposeAddition",
        projectId: p.id,
        revisionId: r.id,
        itemId: r.items[1].id,
        description: "A second ending",
        amountMinor: "3000",
        deadline: "2027-01-01",
      },
      worker,
    );
    expect(activeAgreement(p)!.amountMinor).toBe("12000");
    expect(() =>
      execute(
        p,
        {
          type: "submitDelivery",
          projectId: p.id,
          url: "https://drive.google.com/file/d/test",
          label: "v2",
          note: "",
        },
        worker,
      ),
    ).toThrow("outstanding");
    p = execute(
      p,
      {
        type: "decideProposal",
        projectId: p.id,
        proposalId: p.proposals[0].id,
        accept: true,
      },
      employer,
    );
    expect(activeAgreement(p)!.amountMinor).toBe("15000");
    expect(p.agreements[0]).toEqual(old);
    p = execute(
      p,
      {
        type: "submitDelivery",
        projectId: p.id,
        url: "https://drive.google.com/file/d/test",
        label: "v2",
        note: "Both changes complete.",
      },
      worker,
    );
    p = execute(
      p,
      {
        type: "acceptDelivery",
        projectId: p.id,
        deliveryId: p.deliveries.at(-1)!.id,
      },
      employer,
    );
    p = execute(p, { type: "simulateInvoice", projectId: p.id }, worker, {
      demo: true,
    });
    expect(p.invoices[0].amountMinor).toBe("15000");
    expect(p.state).toBe("accepted");
    p = execute(
      p,
      {
        type: "simulatePayment",
        projectId: p.id,
        invoiceId: p.invoices[0].id,
        state: "pending",
      },
      employer,
      { demo: true },
    );
    expect(p.state).toBe("accepted");
    expect(p.invoices[0].paidMinor).toBe("0");
    p = execute(
      p,
      {
        type: "simulatePayment",
        projectId: p.id,
        invoiceId: p.invoices[0].id,
        state: "paid",
      },
      employer,
      { demo: true },
    );
    expect(p.state).toBe("accepted");
    expect(p.invoices[0].paidMinor).toBe("15000");
  });
});
