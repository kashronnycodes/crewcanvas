import { describe, expect, it } from "vitest";
import {
  answerWorkspace,
  approvedTotal,
  connectionMeaning,
  inferIntent,
  projectFinance,
  validateCanvas,
  validateFile,
  validateFileBytes,
  workspaceFinance,
} from "../shared/workspace";
import { IDS, seedWorkspace } from "../shared/seed";
import { activeAgreement, execute, uid } from "../shared/domain";
import { driveUrlSchema, layoutSchema } from "../shared/validation";
import type { WorkspaceFile } from "../shared/types";
describe("workspace files, relationships and financial facts", () => {
  it("validates size, extensions, MIME and actual signatures", () => {
    expect(driveUrlSchema.safeParse("").success).toBe(false);
    expect(driveUrlSchema.safeParse("not a url").success).toBe(false);
    expect(validateFile({ name: "reference.png", size: 45, type: "image/png" }))
      .toBe("image/png");
    for (
      const file of [
        { name: "secret.svg", size: 10, type: "image/svg+xml" },
        { name: "attack.html", size: 10, type: "text/html" },
        { name: "fake.png", size: 10, type: "text/html" },
        { name: "empty.pdf", size: 0, type: "application/pdf" },
        { name: "large.mp4", size: 26 * 1024 * 1024, type: "video/mp4" },
      ]
    ) expect(() => validateFile(file)).toThrow();
    expect(() =>
      validateFileBytes("work.pdf", new TextEncoder().encode("%PDF-1.7\n"))
    ).not.toThrow();
    expect(() =>
      validateFileBytes(
        "fake.png",
        new TextEncoder().encode("<script>alert(1)</script>"),
      )
    ).toThrow();
    expect(() =>
      validateFileBytes("image.jpg", new Uint8Array([255, 216, 255, 224]))
    ).not.toThrow();
  });
  it("keeps old layouts valid while persisting typed card geometry and connections", () => {
    const s = seedWorkspace();
    expect(layoutSchema.parse(s.layout)).toMatchObject({ schemaVersion: 1 });
    const layout = {
      ...s.layout,
      cards: [{ id: `task:${s.projects[0].id}`, x: -25, y: 300, width: 300 }],
      connections: [{
        id: uid(),
        source: s.projects[0].workerId,
        target: `task:${s.projects[0].id}`,
      }],
    };
    expect(() => validateCanvas(s, layoutSchema.parse(layout))).not.toThrow();
    expect(() =>
      validateCanvas(s, {
        ...layout,
        cards: [{ id: `task:${uid()}`, x: 0, y: 0 }],
      })
    ).toThrow();
    expect(() =>
      validateCanvas(s, {
        ...layout,
        connections: [{
          id: uid(),
          source: IDS.sofia,
          target: `task:${s.projects[0].id}`,
        }],
      })
    ).toThrow();
  });
  it("does not allow cross-project task/payment relationships or reassign through an edge", () => {
    const s = seedWorkspace(), a = s.projects[0], b = s.projects[1];
    expect(connectionMeaning(s, `task:${a.id}`, `payment:${a.id}`))
      .toBeTruthy();
    expect(connectionMeaning(s, `task:${a.id}`, `payment:${b.id}`)).toBeNull();
    expect(connectionMeaning(s, b.workerId, `task:${a.id}`)).toBeNull();
    expect(connectionMeaning(s, `project:${a.id}`, a.workerId)).toBe(
      "Project freelancer",
    );
  });
  it("does not double count approved revision charges or treat pending funds as settled", () => {
    const s = seedWorkspace(),
      p = s.projects.find((p) =>
        p.proposals.some((x) => x.status === "pending")
      )!;
    const old = BigInt(activeAgreement(p)!.amountMinor),
      proposal = p.proposals[0];
    const next = execute(p, {
      type: "decideProposal",
      projectId: p.id,
      proposalId: proposal.id,
      accept: true,
    }, { id: IDS.myron, role: "employer", workspaceId: s.id });
    expect(approvedTotal(next)).toBe(old + BigInt(proposal.amountMinor));
    const accepted = {
      ...next,
      state: "accepted" as const,
      invoices: [{
        ...s.projects.find((p) => p.invoices.length)!.invoices[0],
        amountMinor: approvedTotal(next).toString(),
        paidMinor: "0",
        pendingMinor: "1000",
        state: "pending" as const,
      }],
    };
    expect(projectFinance(accepted).settled).toBe(0n);
    expect(projectFinance(accepted).awaiting).toBe(
      approvedTotal(accepted) - 1000n,
    );
    expect(workspaceFinance({ ...s, projects: [accepted] }).pending).toBe(
      1000n,
    );
  });
  it("answers against actual records, highlights nodes and refuses to invent monthly spending", () => {
    const s = seedWorkspace(), answer = answerWorkspace(s, "payments", "demo");
    expect(answer.text).toContain("Local sample records");
    expect(answer.highlight.length).toBeGreaterThan(0);
    expect(answerWorkspace(s, "spending", "demo").text).toContain(
      "not verified monthly spending",
    );
    expect(inferIntent("How much have I spent this month?")).toBe("spending");
    expect(answerWorkspace({ ...s, projects: [] }, "progress", "demo").text)
      .toContain("No project activity recorded today");
    expect(
      answerWorkspace(s, "overdue", "demo", new Date("2026-12-01T00:00:00Z"))
        .highlight.length,
    ).toBeGreaterThan(0);
  });
  it("submits stored evidence with an immutable file version, enforcing worker review roles", () => {
    const s = seedWorkspace(), p = s.projects[0];
    const command = {
      type: "submitFileDelivery" as const,
      projectId: p.id,
      fileId: uid(),
      fileVersion: 0,
      label: "uploaded-v1",
      note: "A persisted deliverable",
    };
    const submitted = execute(p, command, {
      id: p.workerId,
      role: "worker",
      workspaceId: s.id,
    });
    expect(submitted.deliveries.at(-1)).toMatchObject({
      fileId: command.fileId,
      fileVersion: 0,
      status: "submitted",
      url: "",
    });
    expect(() =>
      execute(submitted, {
        type: "acceptDelivery",
        projectId: p.id,
        deliveryId: submitted.deliveries.at(-1)!.id,
      }, { id: p.workerId, role: "worker", workspaceId: s.id })
    ).toThrow();
    const accepted = execute(submitted, {
      type: "acceptDelivery",
      projectId: p.id,
      deliveryId: submitted.deliveries.at(-1)!.id,
    }, { id: IDS.myron, role: "employer", workspaceId: s.id });
    expect(accepted.state).toBe("accepted");
    expect(accepted.invoices).toHaveLength(p.invoices.length);
  });
});
