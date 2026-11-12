import { describe, expect, it } from "vitest";
import { seedWorkspace } from "../shared/seed";
import { execute, makeAgreement } from "../shared/domain";
import {
  paymentSummary,
  revisionSummary,
  simpleFreelanceGraph,
} from "../shared/freelance-canvas";
import { connectionMeaning, validateCanvas } from "../shared/workspace";
import type { Project, SessionActor } from "../shared/types";

function fixture() {
  const s = seedWorkspace(), p = structuredClone(s.projects[0]);
  const employer: SessionActor = {
    id: s.actorId,
    role: "employer",
    workspaceId: s.id,
  };
  const worker: SessionActor = {
    id: p.workerId,
    role: "worker",
    workspaceId: s.id,
  };
  const a = makeAgreement(
    {
      brief: "Edit a thirty-second promotional video.",
      tasks: ["Edit and submit the promotional video"],
      deliverables: ["One 30-second video"],
      amountMinor: "5000",
      currency: "USD",
      deadline: "2026-11-08",
      revisionRounds: 1,
      paymentDays: 7,
    },
    employer.id,
    null,
    "2026-11-01T00:00:00Z",
  );
  a.status = "accepted";
  a.acceptedBy = worker.id;
  a.acceptedAt = a.createdAt;
  Object.assign(p, {
    origin: "sandbox",
    agreements: [a],
    activeAgreementId: a.id,
    state: "in_progress",
    deliveries: [],
    revisions: [],
    proposals: [],
    invoices: [],
    activity: [],
  });
  s.projects = [p];
  s.people = s.people.filter((person) =>
    [worker.id, employer.id].includes(person.id)
  );
  const run = (
    project: Project,
    command: Record<string, unknown>,
    actor: SessionActor,
  ) =>
    execute(
      project,
      { ...command, projectId: project.id } as Parameters<typeof execute>[1],
      actor,
    );
  return { s, p, employer, worker, run };
}
describe("simple freelancer workflow and financial consent", () => {
  it("starts with four meaningful work cards, one freelancer, no invented submission or fee", () => {
    const { s } = fixture(),
      before = structuredClone(s),
      g = simpleFreelanceGraph(s);
    expect(g.cards.map((n) => n.kind)).toEqual([
      "agreement",
      "task",
      "submission",
      "payment",
    ]);
    expect(g.edges).toHaveLength(4);
    expect(s).toEqual(before);
    for (const e of g.edges) {
      expect(connectionMeaning(s, e.source, e.target)).toBeTruthy();
    }
    expect(g.cards.find((n) => n.kind === "submission")?.status).toBe(
      "Nothing submitted yet",
    );
  });
  it("only allows submission placeholders belonging to authorized workspace projects", () => {
    const { s } = fixture(), g = simpleFreelanceGraph(s);
    const layout = {
      ...s.layout,
      cards: g.cards.map((n) => ({ id: n.id, x: n.x, y: n.y })),
      connections: g.edges,
    };
    expect(() => validateCanvas(s, layout)).not.toThrow();
    expect(() =>
      validateCanvas(s, {
        ...layout,
        cards: [{ id: `submission:${crypto.randomUUID()}`, x: 0, y: 0 }],
      })
    ).toThrow("outside this workspace");
  });
  it("keeps a revision attached to its actual earlier submission after a newer version arrives", () => {
    const { s, p } = fixture(),
      first = crypto.randomUUID(),
      second = crypto.randomUUID(),
      revision = crypto.randomUUID();
    p.deliveries = [{
      id: first,
      agreementId: p.activeAgreementId!,
      url: "https://drive.google.com/file/d/first",
      label: "Draft 1",
      note: "",
      submittedAt: "2026-11-01T00:00:00Z",
      status: "changes_requested",
    }, {
      id: second,
      agreementId: p.activeAgreementId!,
      url: "https://drive.google.com/file/d/second",
      label: "Draft 2",
      note: "",
      submittedAt: "2026-11-02T00:00:00Z",
      status: "submitted",
    }];
    p.revisions = [{
      id: revision,
      agreementId: p.activeAgreementId!,
      text: "Change the background music",
      createdAt: "2026-11-01T12:00:00Z",
      roundConsumed: true,
      items: [],
    }];
    const g = simpleFreelanceGraph(s);
    expect(
      g.edges.some((e) =>
        e.source === `delivery:${first}` && e.target === `revision:${revision}`
      ),
    ).toBe(true);
    expect(g.cards.filter((n) => n.kind === "delivery")).toHaveLength(2);
    expect(g.cards.find((n) => n.id === `delivery:${first}`)?.title).toBe(
      "Earlier work · Draft 1",
    );
  });
  it("shows proposed $50 separately from accepted commitments", () => {
    const { p, s } = fixture();
    p.agreements[0].status = "proposed";
    p.activeAgreementId = null;
    expect(simpleFreelanceGraph(s).cards[0]).toMatchObject({
      status: "Awaiting acceptance",
      subtitle: "$50.00 · 1 included revision",
    });
    expect(paymentSummary(p)).toMatchObject({ total: "0", status: "Pending" });
  });
  it("keeps $50 unchanged through a request and pending $10 fee, then shows $60 only after client approval", () => {
    const { p, run, worker, employer, s } = fixture();
    let next = run(p, {
      type: "submitDelivery",
      url: "https://drive.google.com/file/d/synthetic/view",
      label: "Draft video",
      note: "Synthetic test",
    }, worker);
    next = run(next, {
      type: "requestRevision",
      text: "Please change the background music.",
      items: [{
        text: "Please change the background music.",
        classification: "unclear",
        explanation: "Needs agreement",
        uncertainty: "high",
        sources: [],
      }],
    }, employer);
    const revision = next.revisions[0];
    expect(paymentSummary(next).total).toBe("5000");
    expect(next.invoices).toHaveLength(0);
    next = run(next, {
      type: "proposeAddition",
      revisionId: revision.id,
      itemId: revision.items[0].id,
      description: "Change background music",
      amountMinor: "1000",
      deadline: null,
    }, worker);
    expect(paymentSummary(next).total).toBe("5000");
    expect(revisionSummary(next, revision.id)).toContain(
      "$10.00 · Awaiting client approval",
    );
    const declined = run(next, {
      type: "decideProposal",
      proposalId: next.proposals[0].id,
      accept: false,
    }, employer);
    expect(paymentSummary(declined).total).toBe("5000");
    expect(revisionSummary(declined, revision.id)).toContain("declined");
    next = run(next, {
      type: "decideProposal",
      proposalId: next.proposals[0].id,
      accept: true,
    }, employer);
    expect(paymentSummary(next)).toEqual({
      original: "5000",
      additions: "1000",
      total: "6000",
      status: "Pending",
    });
    expect(revisionSummary(next, revision.id)).toBe(
      "Revision fee: $10.00 · Approved",
    );
    expect(next.invoices).toHaveLength(0);
    const g = simpleFreelanceGraph({ ...s, projects: [next] });
    expect(
      g.edges.some((e) =>
        e.source === `delivery:${next.deliveries[0].id}` &&
        e.target === `revision:${revision.id}`
      ),
    ).toBe(true);
  });
  it("never displays sample invoice settlement as verified Sandbox payment", () => {
    const { p } = fixture();
    p.invoices = seedWorkspace().projects.flatMap((p) => p.invoices).filter(
      (i) => BigInt(i.paidMinor) > 0n,
    ).map((i) => ({ ...i, source: "sample", paidMinor: "5000" }));
    expect(p.invoices.length).toBeGreaterThan(0);
    expect(paymentSummary(p).status).toBe("Pending");
  });
  it("adds one compact lane per project without mutating saved layouts or duplicating history", () => {
    const { s, p } = fixture();
    p.deliveries = [1, 2, 3].map((i) => ({
      id: `delivery${i}`,
      agreementId: p.activeAgreementId!,
      url: "https://drive.google.com/file/d/test",
      label: `Version ${i}`,
      note: "",
      submittedAt: `2026-11-0${i}T00:00:00Z`,
      status: "submitted",
    }));
    const g = simpleFreelanceGraph(s);
    expect(g.cards.filter((n) => n.kind === "delivery")).toHaveLength(1);
    expect(g.cards.find((n) => n.kind === "delivery")?.title).toBe("Version 3");
    s.projects.push({ ...p, id: "second" }, { ...p, id: "third" });
    expect(simpleFreelanceGraph(s).cards).toHaveLength(12);
  });
});
