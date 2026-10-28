import type {
  Agreement,
  CanvasLayout,
  Invoice,
  Project,
  SessionActor,
  ScopeItem,
} from "./types.ts";
import { commandSchema, type Command } from "./validation.ts";
export class DomainError extends Error {
  constructor(
    public code: "FORBIDDEN" | "CONFLICT" | "VALIDATION" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}
export const uid = () => crypto.randomUUID();
export const money = (minor: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(BigInt(minor)) / 100);
export function parseAmount(input: string): string {
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(input.trim()))
    throw new DomainError(
      "VALIDATION",
      "Enter a USD amount with at most two decimal places.",
    );
  const [dollars, cents = ""] = input.trim().split(".");
  return (BigInt(dollars) * 100n + BigInt(cents.padEnd(2, "0"))).toString();
}
export const paypalAmount = (minor: string) =>
  `${BigInt(minor) / 100n}.${(BigInt(minor) % 100n).toString().padStart(2, "0")}`;
export const activeAgreement = (project: Project) =>
  project.agreements.find((a) => a.id === project.activeAgreementId);
export const todayIn = (timezone = "Asia/Manila", now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export function invoiceAttention(invoice: Invoice, today: string): boolean {
  if (
    invoice.state === "cancelled" ||
    invoice.state === "refunded" ||
    invoice.state === "paid" ||
    invoice.state === "unknown"
  )
    return false;
  if (invoice.error || invoice.state === "failed") return true;
  const collectible =
    BigInt(invoice.amountMinor) -
    BigInt(invoice.paidMinor) -
    BigInt(invoice.pendingMinor);
  return (
    invoice.state !== "draft" && collectible > 0n && invoice.dueDate <= today
  );
}
export function indicators(
  projects: Project[],
  workerIds: string[],
  today = todayIn(),
) {
  const visible = projects.filter((p) => workerIds.includes(p.workerId));
  return {
    completed: new Set(
      visible.filter((p) => p.state === "accepted").map((p) => p.id),
    ).size,
    attention: new Set(
      visible
        .filter((p) => p.invoices.some((i) => invoiceAttention(i, today)))
        .map((p) => p.id),
    ).size,
  };
}
export function reparent(
  layout: CanvasLayout,
  personId: string,
  groupId: string | null,
): CanvasLayout {
  const next = structuredClone(layout);
  const person = next.people.find((p) => p.id === personId);
  if (!person) throw new DomainError("NOT_FOUND", "Person not on canvas.");
  const old = next.groups.find((g) => g.id === person.groupId);
  const target = next.groups.find((g) => g.id === groupId);
  if (groupId && !target) throw new DomainError("VALIDATION", "Unknown group.");
  person.x += (old?.x ?? 0) - (target?.x ?? 0);
  person.y += (old?.y ?? 0) - (target?.y ?? 0);
  person.groupId = groupId;
  return next;
}
export function verifySources(items: ScopeItem[], agreement: Agreement) {
  for (const item of items)
    for (const source of item.sources) {
      const clause = agreement.clauses.find((c) => c.id === source.clauseId);
      if (!source.quote || !clause?.text.includes(source.quote))
        throw new DomainError(
          "VALIDATION",
          "An AI source does not match the accepted agreement. Try again or use manual review.",
        );
    }
}
export function assertProjectAccess(actor: SessionActor, project: Project) {
  if (
    actor.workspaceId !== project.workspaceId ||
    (actor.role === "worker" && actor.id !== project.workerId)
  )
    throw new DomainError(
      "FORBIDDEN",
      "You do not have access to this project.",
    );
}
export function execute(
  project: Project,
  input: Command,
  actor: SessionActor,
  options: { demo?: boolean; now?: string } = {},
): Project {
  const command = commandSchema.parse(input);
  assertProjectAccess(actor, project);
  if (command.type === "createProject")
    throw new DomainError("VALIDATION", "Use the create project operation.");
  if (command.projectId !== project.id)
    throw new DomainError("FORBIDDEN", "Project identifier mismatch.");
  const p = structuredClone(project);
  const now = options.now ?? new Date().toISOString();
  const employer = () => {
    if (actor.role !== "employer")
      throw new DomainError(
        "FORBIDDEN",
        "Only the employer can perform this action.",
      );
  };
  const worker = () => {
    if (actor.role !== "worker" || actor.id !== p.workerId)
      throw new DomainError(
        "FORBIDDEN",
        "Only the assigned worker can perform this action.",
      );
  };
  const agreed = () => {
    const a = activeAgreement(p);
    if (!a)
      throw new DomainError(
        "CONFLICT",
        "The agreement must be accepted first.",
      );
    return a;
  };
  const log = (text: string) =>
    p.activity.push({ id: uid(), actorId: actor.id, text, createdAt: now });
  switch (command.type) {
    case "proposeAgreement": {
      employer();
      if (
        p.agreements.some((a) => a.status === "proposed") ||
        p.proposals.some((a) => a.status === "pending")
      )
        throw new DomainError(
          "CONFLICT",
          "Resolve the outstanding terms proposal first.",
        );
      if (
        p.invoices.length &&
        command.terms.amountMinor !== agreed().amountMinor
      )
        throw new DomainError(
          "CONFLICT",
          "Use an addition for new charges after invoicing.",
        );
      p.agreements.push(
        makeAgreement(command.terms, actor.id, p.activeAgreementId, now),
      );
      log("Proposed a new agreement version. Accepted terms remain in effect.");
      break;
    }
    case "decideAgreement": {
      worker();
      const a = p.agreements.find((x) => x.id === command.agreementId);
      if (!a) throw new DomainError("NOT_FOUND", "Agreement not found.");
      if (a.status === "accepted" && command.accept) return project;
      if (a.status !== "proposed")
        throw new DomainError(
          "CONFLICT",
          "This agreement is no longer awaiting a decision.",
        );
      if (a.baseId !== p.activeAgreementId)
        throw new DomainError(
          "CONFLICT",
          "Terms changed. Ask for an updated proposal.",
        );
      a.status = command.accept ? "accepted" : "declined";
      if (command.accept) {
        a.acceptedAt = now;
        a.acceptedBy = actor.id;
        p.activeAgreementId = a.id;
        p.state = "in_progress";
      }
      log(
        command.accept
          ? "Accepted the agreement."
          : "Declined the proposed agreement.",
      );
      break;
    }
    case "submitDelivery": {
      worker();
      const a = agreed();
      if (p.deliveries.some((d) => d.label === command.label))
        throw new DomainError(
          "CONFLICT",
          "Use a unique delivery version label.",
        );
      if (
        p.revisions.some((r) =>
          r.items.some(
            (i) =>
              i.disposition === "awaiting_response" ||
              i.disposition === "clarification",
          ),
        ) ||
        p.proposals.some((x) => x.status === "pending")
      )
        throw new DomainError(
          "CONFLICT",
          "Resolve outstanding revision decisions before submitting.",
        );
      p.deliveries.push({
        id: uid(),
        agreementId: a.id,
        url: command.url,
        label: command.label,
        note: command.note,
        submittedAt: now,
        status: "submitted",
      });
      for (const r of p.revisions)
        for (const item of r.items)
          if (["included", "extra_proposed"].includes(item.disposition))
            item.disposition = "resolved";
      p.state = "submitted";
      log(`Submitted ${command.label} for review.`);
      break;
    }
    case "acceptDelivery": {
      employer();
      const d = p.deliveries.find((x) => x.id === command.deliveryId);
      if (d?.status === "accepted" && p.state === "accepted") return project;
      if (
        !d ||
        d !== p.deliveries.at(-1) ||
        d.status !== "submitted" ||
        d.agreementId !== p.activeAgreementId ||
        p.state !== "submitted"
      )
        throw new DomainError(
          "CONFLICT",
          "Accept the latest submitted delivery under the current agreement.",
        );
      if (
        p.proposals.some((x) => x.status === "pending") ||
        p.agreements.some((a) => a.status === "proposed")
      )
        throw new DomainError(
          "CONFLICT",
          "Resolve pending scope changes first.",
        );
      d.status = "accepted";
      d.acceptedAt = now;
      p.state = "accepted";
      log(`Accepted ${d.label}. Payment status is tracked separately.`);
      break;
    }
    case "requestRevision": {
      employer();
      const a = agreed();
      if (p.state !== "submitted")
        throw new DomainError(
          "CONFLICT",
          "Request revisions on a submitted delivery.",
        );
      verifySources(command.items, a);
      p.revisions.push({
        id: uid(),
        text: command.text,
        agreementId: a.id,
        createdAt: now,
        roundConsumed: false,
        items: command.items.map((i) => ({
          ...i,
          id: uid(),
          disposition: "awaiting_response",
        })),
      });
      p.deliveries.at(-1)!.status = "changes_requested";
      p.state = "changes_requested";
      log("Requested changes. No fee has been created.");
      break;
    }
    case "respondRevision": {
      worker();
      const r = p.revisions.find((x) => x.id === command.revisionId);
      const i = r?.items.find((x) => x.id === command.itemId);
      if (
        !r ||
        !i ||
        !["awaiting_response", "clarification"].includes(i.disposition)
      )
        throw new DomainError(
          "CONFLICT",
          "This revision item has already been handled.",
        );
      if (
        command.disposition === "included" &&
        !r.roundConsumed &&
        !command.waiveRound
      ) {
        const used = p.revisions.filter((x) => x.roundConsumed).length;
        if (used >= agreed().revisionRounds)
          throw new DomainError(
            "CONFLICT",
            "No included rounds remain. Explicitly waive the round or discuss additional work.",
          );
        r.roundConsumed = true;
      }
      i.disposition = command.disposition;
      i.note = command.note;
      p.state = "changes_requested";
      log(
        command.disposition === "included"
          ? "Accepted a revision item as included; no fee added."
          : `Asked for clarification: ${command.note}`,
      );
      break;
    }
    case "proposeAddition": {
      worker();
      const r = p.revisions.find((x) => x.id === command.revisionId);
      const i = r?.items.find((x) => x.id === command.itemId);
      if (
        !r ||
        !i ||
        !["awaiting_response", "clarification"].includes(i.disposition)
      )
        throw new DomainError(
          "CONFLICT",
          "This revision item has already been handled.",
        );
      if (p.agreements.some((a) => a.status === "proposed"))
        throw new DomainError(
          "CONFLICT",
          "Resolve the proposed agreement first.",
        );
      p.proposals.push({
        id: uid(),
        revisionId: r.id,
        itemId: i.id,
        baseAgreementId: agreed().id,
        description: command.description,
        amountMinor: command.amountMinor,
        deadline: command.deadline,
        status: "pending",
        createdAt: now,
        authorId: actor.id,
      });
      i.disposition = "extra_proposed";
      log(
        `Proposed additional work for ${money(command.amountMinor)}. Total unchanged pending approval.`,
      );
      break;
    }
    case "decideProposal": {
      employer();
      const proposal = p.proposals.find((x) => x.id === command.proposalId);
      if (!proposal) throw new DomainError("NOT_FOUND", "Proposal not found.");
      if (proposal.status === "accepted" && command.accept) return project;
      if (proposal.status !== "pending")
        throw new DomainError("CONFLICT", "Proposal already decided.");
      const current = agreed();
      if (command.accept && proposal.baseAgreementId !== current.id)
        throw new DomainError(
          "CONFLICT",
          "Agreement changed; ask the worker to submit a rebased proposal.",
        );
      proposal.status = command.accept ? "accepted" : "declined";
      proposal.decidedAt = now;
      const item = p.revisions
        .find((r) => r.id === proposal.revisionId)
        ?.items.find((i) => i.id === proposal.itemId);
      if (command.accept) {
        const next = makeAgreement(
          {
            ...current,
            brief: `${current.brief}\n\nApproved addition: ${proposal.description}`,
            deliverables: [...current.deliverables, proposal.description],
            amountMinor: (
              BigInt(current.amountMinor) + BigInt(proposal.amountMinor)
            ).toString(),
            deadline: proposal.deadline ?? current.deadline,
          },
          proposal.authorId,
          current.id,
          now,
        );
        next.status = "accepted";
        next.acceptedAt = now;
        next.acceptedBy = actor.id;
        p.agreements.push(next);
        p.activeAgreementId = next.id;
        p.state = "changes_requested";
      } else if (item) item.disposition = "resolved";
      log(
        command.accept
          ? `Approved addition: ${money(proposal.amountMinor)}${proposal.amountMinor === "0" ? " (charge waived)" : ""}.`
          : "Declined the additional work proposal.",
      );
      break;
    }
    case "rebaseProposal": {
      worker();
      const old = p.proposals.find((x) => x.id === command.proposalId);
      if (!old || old.status !== "pending")
        throw new DomainError(
          "CONFLICT",
          "This proposal is no longer pending.",
        );
      if (old.baseAgreementId === agreed().id) return project;
      old.status = "superseded";
      old.decidedAt = now;
      p.proposals.push({
        ...old,
        id: uid(),
        baseAgreementId: agreed().id,
        status: "pending",
        createdAt: now,
        decidedAt: undefined,
      });
      log(
        "Worker rebased an additional-work proposal on the latest accepted terms. Price still requires employer approval.",
      );
      break;
    }
    case "discuss": {
      log(`Comment: ${command.text}`);
      break;
    }
    case "simulateInvoice": {
      worker();
      if (!options.demo)
        throw new DomainError(
          "FORBIDDEN",
          "Simulated invoices are available only in demo mode.",
        );
      const a = agreed();
      if (p.state !== "accepted")
        throw new DomainError(
          "CONFLICT",
          "Accept the delivery before invoicing.",
        );
      const invoiced = p.invoices
        .filter((i) => i.state !== "cancelled")
        .reduce((sum, i) => sum + BigInt(i.amountMinor), 0n);
      const remaining = BigInt(a.amountMinor) - invoiced;
      if (remaining <= 0n)
        throw new DomainError(
          "CONFLICT",
          "All approved charges are already invoiced.",
        );
      const due = new Date(
        p.deliveries.filter((d) => d.status === "accepted").at(-1)
          ?.acceptedAt ?? now,
      );
      due.setUTCDate(due.getUTCDate() + a.paymentDays);
      p.invoices.push({
        id: uid(),
        sellerConnectionId: "demo",
        providerId: null,
        number: `DEMO-${p.invoices.length + 1}`,
        amountMinor: remaining.toString(),
        paidMinor: "0",
        pendingMinor: "0",
        dueDate: todayIn("Asia/Manila", due),
        state: "unpaid",
        rawStatus: "SIMULATED",
        recipientUrl: null,
        source: "sample",
        chargeIds: [a.id],
        syncedAt: now,
      });
      log("Created a simulated invoice. No transaction occurred.");
      break;
    }
    case "simulatePayment": {
      if (!options.demo)
        throw new DomainError(
          "FORBIDDEN",
          "Simulated payments are available only in demo mode.",
        );
      const i = p.invoices.find((x) => x.id === command.invoiceId);
      if (!i) throw new DomainError("NOT_FOUND", "Invoice not found.");
      i.state = command.state;
      i.pendingMinor =
        command.state === "pending"
          ? (BigInt(i.amountMinor) - BigInt(i.paidMinor)).toString()
          : "0";
      i.paidMinor =
        command.state === "paid"
          ? i.amountMinor
          : command.state === "partial"
            ? (BigInt(i.amountMinor) / 2n).toString()
            : i.paidMinor;
      i.syncedAt = now;
      log(
        `Simulated payment state: ${command.state}. No real payment occurred.`,
      );
      break;
    }
  }
  p.version += 1;
  return p;
}
export function makeAgreement(
  terms: Pick<
    Agreement,
    | "brief"
    | "deliverables"
    | "amountMinor"
    | "currency"
    | "deadline"
    | "revisionRounds"
    | "paymentDays"
  > & { tasks?: string[] },
  actorId: string,
  baseId: string | null,
  now = new Date().toISOString(),
): Agreement {
  const clauses = [
    { id: "brief", text: terms.brief },
    ...terms.deliverables.map((text, i) => ({
      id: `deliverable-${i + 1}`,
      text,
    })),
    ...(terms.tasks ?? []).map((text, i) => ({ id: `task-${i + 1}`, text })),
    {
      id: "revisions",
      text: `${terms.revisionRounds} consolidated revision rounds included. Additional work requires mutual approval. No automatic fees.`,
    },
    {
      id: "payment",
      text: `Payment due ${terms.paymentDays} calendar days after delivery acceptance.`,
    },
  ];
  return {
    brief: terms.brief,
    tasks: terms.tasks ?? [],
    deliverables: [...terms.deliverables],
    amountMinor: terms.amountMinor,
    currency: terms.currency,
    deadline: terms.deadline,
    revisionRounds: terms.revisionRounds,
    paymentDays: terms.paymentDays,
    id: uid(),
    status: "proposed",
    authorId: actorId,
    baseId,
    clauses,
    createdAt: now,
  };
}
