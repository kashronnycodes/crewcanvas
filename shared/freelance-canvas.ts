import type { Project, WorkspaceSnapshot } from "./types.ts";
import { activeAgreement, money } from "./domain.ts";
import { projectFinance } from "./workspace.ts";

export type ProjectTab =
  | "overview"
  | "deliverables"
  | "revisions"
  | "payments"
  | "activity";
export function visibleTerms(p: Project) {
  return activeAgreement(p) ??
    [...p.agreements].reverse().find((a) => a.status === "proposed") ??
    p.agreements.at(-1);
}
export function paymentSummary(p: Project) {
  const finance = projectFinance(p, true), accepted = activeAgreement(p);
  const first =
    p.agreements.find((a) => a.status === "accepted" && !a.baseId) ??
      p.agreements.find((a) => a.status === "accepted");
  return {
    original: first?.amountMinor ?? "0",
    additions: p.proposals.filter((a) => a.status === "accepted").reduce(
      (sum, a) => sum + BigInt(a.amountMinor),
      0n,
    ).toString(),
    total: accepted?.amountMinor ?? "0",
    // Sample history must never produce a verified Sandbox paid badge.
    status: finance.total > 0n && finance.settled >= finance.total &&
        p.origin === "sandbox"
      ? "Paid · verified PayPal Sandbox"
      : finance.pending > 0n
      ? "Pending · processing"
      : "Pending",
  };
}
export function revisionSummary(p: Project, revisionId: string) {
  const proposals = p.proposals.filter((a) => a.revisionId === revisionId);
  const accepted = proposals.filter((a) => a.status === "accepted");
  const pending = proposals.filter((a) => a.status === "pending");
  const total = (items: typeof proposals) =>
    money(items.reduce((sum, a) => sum + BigInt(a.amountMinor), 0n).toString());
  if (pending.length) {
    return `Revision fee: ${total(pending)} · Awaiting client approval${
      accepted.length ? ` · ${total(accepted)} already approved` : ""
    }`;
  }
  if (accepted.length) return `Revision fee: ${total(accepted)} · Approved`;
  if (proposals.some((a) => a.status === "declined")) {
    return "Revision fee declined · no additional charge";
  }
  const revision = p.revisions.find((r) => r.id === revisionId);
  return revision?.items.some((i) => i.disposition === "included")
    ? "Included revision · no additional fee"
    : "Fee not agreed · awaiting freelancer response";
}
export interface SimpleCard {
  id: string;
  kind:
    | "agreement"
    | "task"
    | "submission"
    | "delivery"
    | "revision"
    | "payment";
  title: string;
  subtitle: string;
  status: string;
  x: number;
  y: number;
  project: Project;
  tab: ProjectTab;
}
export function simpleFreelanceGraph(s: WorkspaceSnapshot) {
  const cards: SimpleCard[] = [],
    edges: { id: string; source: string; target: string }[] = [];
  const link = (source: string, target: string) =>
    edges.push({ id: `flow-${source}-${target}`, source, target });
  let row = 100;
  for (const p of s.projects) {
    const terms = visibleTerms(p), latest = p.deliveries.at(-1);
    const add = (
      id: string,
      kind: SimpleCard["kind"],
      title: string,
      subtitle: string,
      status: string,
      x: number,
      y: number,
      tab: ProjectTab,
    ) =>
      cards.push({ id, kind, title, subtitle, status, x, y, project: p, tab });
    add(
      `project:${p.id}`,
      "agreement",
      p.title,
      terms
        ? `${
          money(terms.amountMinor)
        } · ${terms.revisionRounds} included revision${
          terms.revisionRounds === 1 ? "" : "s"
        }`
        : "Set price, deadline and included revisions",
      activeAgreement(p)
        ? "Agreement accepted"
        : terms?.status === "proposed"
        ? "Awaiting acceptance"
        : "Draft agreement",
      350,
      row,
      "overview",
    );
    add(
      `task:${p.id}`,
      "task",
      terms?.tasks?.[0] ?? p.title,
      `Deadline · ${terms?.deadline ?? "Not agreed"}`,
      p.state.replaceAll("_", " "),
      670,
      row,
      "overview",
    );
    const deliveryId = latest ? `delivery:${latest.id}` : `submission:${p.id}`;
    const revisions = p.revisions.filter((r) =>
      r.id === p.revisions.at(-1)?.id ||
      r.items.some((i) => i.disposition !== "resolved")
    );
    const origin = (revision: Project["revisions"][number]) =>
      p.deliveries.filter((d) => d.submittedAt <= revision.createdAt).at(-1);
    const referenced = p.deliveries.filter((d) =>
      d.id !== latest?.id && revisions.some((r) => origin(r)?.id === d.id)
    );
    add(
      deliveryId,
      latest ? "delivery" : "submission",
      latest?.label ?? "Submitted work",
      latest?.note ||
        (latest
          ? "Open the latest submission"
          : "The freelancer’s submission will appear here"),
      latest?.status.replaceAll("_", " ") ?? "Nothing submitted yet",
      990,
      row,
      "deliverables",
    );
    referenced.forEach((delivery, i) => {
      add(
        `delivery:${delivery.id}`,
        "delivery",
        `Earlier work · ${delivery.label}`,
        "Feedback refers to this submission",
        delivery.status.replaceAll("_", " "),
        990,
        row + (i + 1) * 235,
        "deliverables",
      );
      link(`task:${p.id}`, `delivery:${delivery.id}`);
    });
    add(
      `payment:${p.id}`,
      "payment",
      "Project payment",
      "Only accepted fees count toward the total",
      paymentSummary(p).status,
      990,
      row + (referenced.length + 1) * 235 + 10,
      "payments",
    );
    link(p.workerId, `project:${p.id}`);
    link(`project:${p.id}`, `task:${p.id}`);
    link(`task:${p.id}`, deliveryId);
    link(deliveryId, `payment:${p.id}`);
    revisions.forEach((revision, i) => {
      const id = `revision:${revision.id}`;
      add(
        id,
        "revision",
        `Revision request #${
          p.revisions.findIndex((r) => r.id === revision.id) + 1
        }`,
        revisionSummary(p, revision.id),
        revision.text,
        1320,
        row + i * 225,
        "revisions",
      );
      const submitted = origin(revision);
      link(submitted ? `delivery:${submitted.id}` : `task:${p.id}`, id);
    });
    row += Math.max(
      560,
      (referenced.length + 1) * 235 + 325,
      revisions.length * 225 + 40,
    );
  }
  return { cards, edges };
}
