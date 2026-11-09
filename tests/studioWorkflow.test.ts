import { beforeEach, describe, expect, it } from "vitest";
import { activeAgreement, execute, uid } from "../shared/domain";
import { IDS, seedWorkspace } from "../shared/seed";
import { payableInvoice, studioProjects, taskPayment } from "../shared/studio";
import { parentRoute } from "../src/studioNavigation";
import { repository, resetDemo, setDemoActor } from "../src/services";
import type { Invoice, SessionActor } from "../shared/types";
const employer: SessionActor = {
  id: IDS.myron,
  workspaceId: IDS.workspace,
  role: "employer",
};
const worker: SessionActor = {
  id: IDS.ethan,
  workspaceId: IDS.workspace,
  role: "worker",
};
beforeEach(() => resetDemo());
describe("task grouping and creation", () => {
  it("saves a member assignment under its project using the same snapshot in both views", async () => {
    const before = await repository.load(), root = before.projects[0];
    await repository.command({
      type: "createProject",
      parentProjectId: root.id,
      workerId: root.workerId,
      title: "Member task",
      publish: true,
      terms: {
        brief: "Create the requested final export.",
        tasks: ["Member task"],
        deliverables: ["Final export"],
        amountMinor: "1999",
        currency: "USD",
        deadline: "2027-01-01",
        revisionRounds: 1,
        paymentDays: 7,
      },
    }, uid());
    const saved = await repository.load(),
      task = saved.projects.find((p) => p.title === "Member task")!;
    expect(task).toMatchObject({
      parentProjectId: root.id,
      workerId: root.workerId,
      activeAgreementId: null,
      state: "awaiting_agreement",
      invoices: [],
    });
    expect(task.agreements[0].status).toBe("proposed");
    const parent = studioProjects(saved).find((p) => p.id === root.id)!;
    expect(parent.tasks.map((t) => t.id)).toEqual([root.id, task.id]);
    expect(
      parent.roles.flatMap((r) => r.members).find((m) =>
        m.person.id === root.workerId
      )?.tasks,
    ).toHaveLength(2);
    expect(saved.projects.find((p) => p.id === root.id)).toEqual(root);
    setDemoActor(root.workerId);
    expect(
      studioProjects(await repository.load()).flatMap((p) => p.tasks).every((
        p,
      ) => p.workerId === root.workerId),
    ).toBe(true);
  });
  it("does not expose another assignee through a shared project grouping", () => {
    const s = seedWorkspace(), own = s.projects[1];
    own.parentProjectId = s.projects[0].id;
    s.projects = [own];
    s.people = s.people.filter((p) => p.id === own.workerId);
    const group = studioProjects(s).find((p) =>
      p.tasks.some((t) => t.id === own.id)
    )!;
    expect(group.title).toBe("Assigned project");
    expect(group.roles.flatMap((r) => r.members).map((m) => m.person.id))
      .toEqual([own.workerId]);
  });
  it("returns through form, task, member, role and project levels", () => {
    const route = {
      projectId: "p",
      role: "Editor",
      memberId: "m",
      taskId: "t",
    };
    expect(parentRoute(route)).toEqual({
      projectId: "p",
      role: "Editor",
      memberId: "m",
      taskId: undefined,
      tools: undefined,
    });
    expect(
      parentRoute({
        projectId: "p",
        role: "Editor",
        memberId: "m",
        form: true,
      }),
    ).toEqual({
      projectId: "p",
      role: "Editor",
      memberId: "m",
      form: undefined,
    });
    expect(parentRoute({ projectId: "p", role: "Editor", memberId: "m" }))
      .toEqual({ projectId: "p", role: "Editor" });
    expect(parentRoute({ projectId: "p", role: "Editor" })).toEqual({
      projectId: "p",
    });
    expect(parentRoute({ projectId: "p" })).toEqual({});
  });
});
describe("versioned revision counteroffers", () => {
  it("negotiates in both directions, preserves history, and charges only the accepted latest amount once", () => {
    let p = seedWorkspace().projects.find((p) => p.workerId === IDS.ethan)!;
    const original = structuredClone(activeAgreement(p)!);
    const first = p.proposals[0];
    p = execute(p, {
      type: "counterProposal",
      projectId: p.id,
      proposalId: first.id,
      amountMinor: "1500",
      note: "A smaller alternate export.",
    }, employer);
    expect(activeAgreement(p)).toEqual(original);
    expect(p.proposals[0].status).toBe("superseded");
    const second = p.proposals.at(-1)!;
    expect(second).toMatchObject({
      previousProposalId: first.id,
      authorId: employer.id,
      amountMinor: "1500",
      status: "pending",
    });
    p = execute(p, {
      type: "counterProposal",
      projectId: p.id,
      proposalId: second.id,
      amountMinor: "1750",
      note: "",
    }, worker);
    expect(activeAgreement(p)).toEqual(original);
    const command = {
      type: "decideProposal" as const,
      projectId: p.id,
      proposalId: p.proposals.at(-1)!.id,
      accept: true,
    };
    p = execute(p, command, employer);
    expect(activeAgreement(p)!.amountMinor).toBe("9750");
    expect(p.proposals).toHaveLength(3);
    expect(p.invoices).toEqual([]);
    expect(execute(p, command, employer)).toEqual(p);
    expect(taskPayment(p).charges).toBe(1750n);
  });
  it("lets the assigned freelancer accept an employer counteroffer", () => {
    let p = seedWorkspace().projects.find((p) => p.workerId === IDS.ethan)!;
    p = execute(p, {
      type: "counterProposal",
      projectId: p.id,
      proposalId: p.proposals[0].id,
      amountMinor: "1000",
      note: "",
    }, employer);
    const command = {
      type: "decideProposal" as const,
      projectId: p.id,
      proposalId: p.proposals.at(-1)!.id,
      accept: true,
    };
    expect(() => execute(p, command, employer)).toThrow("other party");
    expect(activeAgreement(execute(p, command, worker))!.amountMinor).toBe(
      "9000",
    );
  });
  it("rejects own, stale, superseded and peer responses", () => {
    const p = seedWorkspace().projects.find((p) => p.workerId === IDS.ethan)!;
    const command = {
      type: "counterProposal" as const,
      projectId: p.id,
      proposalId: p.proposals[0].id,
      amountMinor: "1000",
      note: "",
    };
    expect(() => execute(p, command, worker)).toThrow("other party");
    expect(() => execute(p, command, { ...worker, id: IDS.ava })).toThrow(
      "access",
    );
    const next = execute(p, command, employer);
    expect(() => execute(next, command, employer)).toThrow("no longer pending");
    p.proposals[0].baseAgreementId = uid();
    expect(() => execute(p, command, employer)).toThrow("rebase");
  });
});
describe("payment responsibilities", () => {
  const invoice: Invoice = {
    id: uid(),
    sellerConnectionId: uid(),
    providerId: "INV2-SANDBOX",
    number: "Sandbox invoice",
    amountMinor: "12000",
    paidMinor: "0",
    pendingMinor: "0",
    dueDate: "2027-01-02",
    state: "unpaid",
    rawStatus: "SENT",
    recipientUrl: "https://www.sandbox.paypal.com/invoice/p/#test",
    source: "sandbox",
    chargeIds: [],
    syncedAt: "2026-11-09T00:00:00Z",
  };
  it("keeps work approval separate from awaiting invoice, due, processing, partial and paid", () => {
    const p = seedWorkspace().projects[0];
    p.state = "accepted";
    p.invoices = [];
    expect(taskPayment(p)).toMatchObject({
      status: "Awaiting invoice",
      canIssue: true,
      remaining: 12000n,
    });
    p.invoices = [structuredClone(invoice)];
    expect(taskPayment(p)).toMatchObject({
      status: "Payment due",
      canIssue: false,
      due: invoice.dueDate,
    });
    p.invoices[0].state = "pending";
    p.invoices[0].pendingMinor = "12000";
    expect(taskPayment(p).status).toBe("Payment processing");
    expect(payableInvoice(p.invoices[0])).toBe(false);
    p.invoices[0].state = "partial";
    p.invoices[0].pendingMinor = "0";
    p.invoices[0].paidMinor = "6000";
    expect(taskPayment(p)).toMatchObject({
      status: "Partially paid",
      remaining: 6000n,
    });
    p.invoices[0].paidMinor = "12000";
    p.invoices[0].state = "unknown";
    expect(taskPayment(p).status).toBe("Payment status unknown");
    p.invoices[0].state = "paid";
    expect(taskPayment(p)).toMatchObject({ status: "Paid", remaining: 0n });
  });
  it("only exposes real payable Sandbox provider links", () => {
    expect(payableInvoice(invoice)).toBe(true);
    for (
      const changes of [
        { providerId: null },
        { source: "sample" as const },
        { state: "paid" as const },
        { state: "draft" as const },
        { pendingMinor: "1" },
        { recipientUrl: "https://www.paypal.com/invoice/live" },
        { recipientUrl: "https://www.sandbox.paypal.com.evil.test/" },
      ]
    ) expect(payableInvoice({ ...invoice, ...changes })).toBe(false);
  });
  it("names the next actor while acceptance, review or a revision response is pending", () => {
    const p = seedWorkspace().projects[0];
    p.invoices = [];
    p.state = "in_progress";
    expect(taskPayment(p).next).toMatch(/^Freelancer/);
    p.state = "submitted";
    expect(taskPayment(p).next).toMatch(/^Employer/);
    p.state = "awaiting_agreement";
    p.agreements[0].status = "proposed";
    p.activeAgreementId = null;
    expect(taskPayment(p).next).toMatch(/^Freelancer/);
    const revision = seedWorkspace().projects.find((p) =>
      p.workerId === IDS.ethan
    )!;
    expect(taskPayment(revision).next).toMatch(/^Employer/);
  });
});
