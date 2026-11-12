import { describe, expect, it } from "vitest";
import { IDS, seedWorkspace } from "../shared/seed";
import { activeAgreement, execute, uid } from "../shared/domain";
import {
  visibleWorkflow,
  workflowCollections,
  workflowGraph,
} from "../shared/workflow";
import { deliverableUrlSchema, layoutSchema } from "../shared/validation";
import { validateCanvas } from "../shared/workspace";
import { externalPreview } from "../src/components/DeliverablePreview";
import type { Project, ScopeItem, SessionActor } from "../shared/types";
const client: SessionActor = {
  id: IDS.myron,
  role: "employer",
  workspaceId: IDS.workspace,
};
const worker: SessionActor = {
  id: IDS.ava,
  role: "worker",
  workspaceId: IDS.workspace,
};
const item: ScopeItem = {
  text: "Change the opening",
  classification: "unclear",
  uncertainty: "high",
  explanation: "Manual discussion",
  sources: [],
};
function submitted(): Project {
  const p = seedWorkspace().projects[0];
  p.state = "submitted";
  p.revisions = [];
  p.proposals = [];
  p.deliveries = [{
    id: uid(),
    agreementId: p.activeAgreementId!,
    url: "https://drive.google.com/file/d/example/view",
    label: "Draft v1",
    note: "",
    submittedAt: new Date().toISOString(),
    status: "submitted",
  }];
  return p;
}
describe("project organization without permission escalation", () => {
  it("keeps the reference overview compact, with a project connected directly to horizontal peer roles", () => {
    const s = seedWorkspace(), c = workflowCollections(s)[0];
    const graph = workflowGraph(s, c, () => {});
    expect(graph.cards.filter((card) => card.kind === "project")).toHaveLength(1);
    expect(graph.cards.filter((card) => card.kind === "roles")).toHaveLength(0);
    expect(graph.cards.filter((card) => card.kind === "role")).toHaveLength(
      c.roles.length,
    );
    expect(
      graph.cards.some((card) =>
        card.kind === "task" || card.kind === "member"
      ),
    ).toBe(false);
    expect(graph.edges[0].sourceHandle).toBe("bottom");
    const roles = graph.cards.filter((card) => card.kind === "role");
    expect(new Set(roles.map((card) => card.y)).size).toBe(1);
    expect(roles.every((card, i) => !i || card.x - roles[i - 1].x >= 300)).toBe(
      true,
    );
  });
  it("excludes unrelated project titles, roles and peer member IDs from a freelancer's configuration", () => {
    const s = seedWorkspace(), collections = workflowCollections(s);
    const secret = {
      id: uid(),
      title: "Other private client project",
      roles: [{ id: uid(), name: "Private role", members: [IDS.leo] }],
    };
    collections.push(secret);
    const visible = visibleWorkflow(
      collections,
      s.projects.filter((p) => p.workerId === IDS.ava),
      IDS.ava,
    );
    expect(visible.map((c) => c.id)).not.toContain(secret.id);
    expect(visible.flatMap((c) => c.roles.flatMap((r) => r.members))).toEqual([
      IDS.ava,
    ]);
  });
  it("lays out roles, repeated members and many tasks without overlapping cards", () => {
    const s = seedWorkspace(),
      collections = workflowCollections(s),
      c = collections[0];
    c.roles.push({ id: uid(), name: "Custom editor", members: [IDS.ava] });
    s.layout.workflow = collections;
    const graph = workflowGraph(s, c, () => {}, { detailed: true });
    expect(new Set(graph.cards.map((c) => c.id)).size).toBe(graph.cards.length);
    for (let a = 0; a < graph.cards.length; a++) {
      for (let b = a + 1; b < graph.cards.length; b++) {
        const x = graph.cards[a], y = graph.cards[b];
        expect(Math.abs(x.x - y.x) >= 260 || Math.abs(x.y - y.y) >= 140).toBe(
          true,
        );
      }
    }
    const ids = graph.cards.map((c) => c.id);
    expect(
      graph.edges.every((e) =>
        ids.includes(e.source) && ids.includes(e.target)
      ),
    ).toBe(true);
  });
  it("rejects foreign workspace members and duplicate role IDs", () => {
    const s = seedWorkspace(), layout = structuredClone(s.layout);
    layout.workflow = workflowCollections(s);
    layout.workflow[0].roles[0].members.push(uid());
    expect(() => validateCanvas(s, layoutSchema.parse(layout))).toThrow(
      /workspace freelancer/,
    );
    layout.workflow[0].roles[0].members.pop();
    layout.workflow[0].roles.push(layout.workflow[0].roles[0]);
    expect(() => validateCanvas(s, layout)).toThrow(/Duplicate role/);
  });

});
describe("versioned revisions and mutual fee negotiation", () => {
  it("keeps separate free requests tied to their reviewed delivery without changing settlement", () => {
    const p = submitted(), before = structuredClone(p.invoices);
    const first = execute(p, {
      type: "requestRevision",
      projectId: p.id,
      text: item.text,
      items: [item],
      deliveryId: p.deliveries[0].id,
      dueDate: "2027-01-02",
    }, client);
    const second = execute(first, {
      type: "requestRevision",
      projectId: p.id,
      text: "Change the end card",
      items: [item],
    }, client);
    expect(second.revisions).toHaveLength(2);
    expect(second.revisions[0].requestedBy).toBe(client.id);
    expect(second.revisions[0].deliveryId).toBe(p.deliveries[0].id);
    expect(second.revisions[0].dueDate).toBe("2027-01-02");
    expect(second.invoices).toEqual(before);
    expect(second.activeAgreementId).toBe(p.activeAgreementId);
    expect(() =>
      execute(p, {
        type: "requestRevision",
        projectId: p.id,
        text: item.text,
        items: [item],
        deliveryId: uid(),
      }, client)
    ).toThrow(/submitted version/);
  });
  it("requires the other party's decision; counteroffers add the fee once and preserve accepted originals", () => {
    const original = submitted(),
      terms = structuredClone(activeAgreement(original)!);
    let p = execute(original, {
      type: "requestRevision",
      projectId: original.id,
      text: item.text,
      items: [item],
      requestedFeeMinor: "2500",
    }, client);
    const initial = p.proposals[0];
    expect(activeAgreement(p)!.amountMinor).toBe(terms.amountMinor);
    expect(() =>
      execute(p, {
        type: "decideProposal",
        projectId: p.id,
        proposalId: initial.id,
        accept: true,
      }, client)
    ).toThrow(/other party/);
    p = execute(p, {
      type: "counterProposal",
      projectId: p.id,
      proposalId: initial.id,
      amountMinor: "3000",
      deadline: null,
    }, worker);
    const counter = p.proposals.at(-1)!;
    expect(p.proposals[0].status).toBe("superseded");
    expect(() =>
      execute(p, {
        type: "decideProposal",
        projectId: p.id,
        proposalId: counter.id,
        accept: true,
      }, worker)
    ).toThrow(/other party/);
    p = execute(p, {
      type: "decideProposal",
      projectId: p.id,
      proposalId: counter.id,
      accept: true,
    }, client);
    expect(activeAgreement(p)!.amountMinor).toBe(
      (BigInt(terms.amountMinor) + 3000n).toString(),
    );
    expect(p.agreements.find((a) => a.id === terms.id)).toEqual(terms);
    expect(p.invoices).toEqual(original.invoices);
    expect(
      execute(p, {
        type: "decideProposal",
        projectId: p.id,
        proposalId: counter.id,
        accept: true,
      }, client),
    ).toBe(p);
  });
  it("does not let another employer accept a client's offer or a peer freelancer read a task", () => {
    const original = submitted();
    const p = execute(original, {
      type: "requestRevision",
      projectId: original.id,
      text: item.text,
      items: [item],
      requestedFeeMinor: "2500",
    }, client);
    expect(() =>
      execute(p, {
        type: "rebaseProposal",
        projectId: p.id,
        proposalId: p.proposals[0].id,
      }, worker)
    ).toThrow(/author may rebase/);
    expect(() =>
      execute(p, {
        type: "decideProposal",
        projectId: p.id,
        proposalId: p.proposals[0].id,
        accept: true,
      }, { ...client, id: uid() })
    ).toThrow(/other party/);
    expect(() =>
      execute(p, {
        type: "decideProposal",
        projectId: p.id,
        proposalId: p.proposals[0].id,
        accept: true,
      }, { ...worker, id: IDS.leo })
    ).toThrow(/access/);
  });
});
describe("external previews", () => {
  it("allows HTTPS external delivery references without accepting scripts or embedded credentials", () => {
    expect(
      deliverableUrlSchema.safeParse("https://example.com/deliverable").success,
    ).toBe(true);
    for (
      const url of [
        "javascript:alert(1)",
        "http://example.com/file",
        "https://user:secret@example.com/file",
      ]
    ) expect(deliverableUrlSchema.safeParse(url).success).toBe(false);
  });
  it("embeds only exact HTTPS Drive/Docs providers and keeps other links as fallbacks", () => {
    expect(externalPreview("https://drive.google.com/file/d/Abc-123/view"))
      .toBe("https://drive.google.com/file/d/Abc-123/preview");
    expect(externalPreview("https://docs.google.com/document/d/ABC/edit"))
      .toContain("/preview");
    for (
      const url of [
        "javascript:alert(1)",
        "http://drive.google.com/file/d/ABC",
        "https://drive.google.com.evil.test/file/d/ABC",
        "https://user@drive.google.com/file/d/ABC",
        "https://example.com/work",
      ]
    ) expect(externalPreview(url)).toBeNull();
  });
});
