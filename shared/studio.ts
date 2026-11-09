import { collectionTasks, workflowCollections } from "./workflow.ts";
import type {
  Invoice,
  Project,
  WorkspaceSnapshot,
  WorkState,
} from "./types.ts";
import { activeAgreement } from "./domain.ts";
import { projectFinance } from "./workspace.ts";

export const taskLabels: Record<WorkState, string> = {
  awaiting_agreement: "Awaiting acceptance",
  in_progress: "In progress",
  submitted: "Awaiting approval",
  changes_requested: "In progress · changes requested",
  accepted: "Approved",
};
export function studioProjects(s: WorkspaceSnapshot) {
  return workflowCollections(s).map((collection) => ({
    id: collection.id,
    title: collection.title,
    tasks: collectionTasks(s, collection.id),
    roles: collection.roles.map((role) => ({
      id: role.id,
      name: role.name,
      members: role.members.map((id) =>
        s.people.find((person) => person.id === id)
      )
        .filter((person): person is NonNullable<typeof person> => !!person)
        .map((person) => ({
          person,
          tasks: collectionTasks(s, collection.id).filter((t) =>
            t.workerId === person.id &&
            (t.organization
              ? t.organization.roleId === role.id
              : person.role === role.name)
          ),
        })),
    })),
  }));
}
export function payableInvoice(i: Invoice) {
  if (
    i.source !== "sandbox" || !i.providerId || !i.recipientUrl ||
    !["unpaid", "partial"].includes(i.state) || BigInt(i.pendingMinor) > 0n ||
    BigInt(i.amountMinor) <= BigInt(i.paidMinor)
  ) return false;
  try {
    const url = new URL(i.recipientUrl);
    return url.protocol === "https:" &&
      ["www.sandbox.paypal.com", "sandbox.paypal.com"].includes(url.hostname) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}
export function taskPayment(p: Project) {
  const f = projectFinance(p);
  const charges = p.proposals.filter((x) => x.status === "accepted").reduce(
    (sum, x) => sum + BigInt(x.amountMinor),
    0n,
  );
  const base = f.total >= charges ? f.total - charges : 0n;
  const active = p.invoices.filter((i) =>
    !["cancelled", "refunded"].includes(i.state)
  );
  const invoiced = active.reduce((sum, i) => sum + BigInt(i.amountMinor), 0n);
  const canIssue = p.state === "accepted" && !!activeAgreement(p) &&
    (f.total > invoiced ||
      active.some((i) => i.state === "draft" || !!i.error));
  const status = active.some((i) => i.state === "failed" || !!i.error)
    ? "Payment needs attention"
    : active.some((i) => i.state === "unknown")
    ? "Payment status unknown"
    : f.pending > 0n || active.some((i) => i.state === "pending")
    ? "Payment processing"
    : f.total > 0n && f.settled >= f.total && active.length > 0 &&
        active.every((i) => i.state === "paid")
    ? "Paid"
    : f.total === 0n && !!activeAgreement(p) && p.state === "accepted" &&
        !p.invoices.length
    ? "No payment due"
    : f.settled > 0n
    ? "Partially paid"
    : active.some((i) => ["unpaid", "partial"].includes(i.state))
    ? "Payment due"
    : p.invoices.some((i) => i.state === "refunded")
    ? "Refunded"
    : p.invoices.some((i) => i.state === "cancelled") && !active.length
    ? "Invoice cancelled"
    : "Awaiting invoice";
  const proposal = p.proposals.find((item) => item.status === "pending");
  const workNext = proposal
    ? `${
      proposal.authorId === p.workerId ? "Employer" : "Freelancer"
    } · accept or counter the revision price`
    : p.state === "awaiting_agreement"
    ? p.agreements.some((a) => a.status === "proposed")
      ? "Freelancer · review proposed scope and price"
      : "Employer · propose task scope and price"
    : p.state === "submitted"
    ? "Employer · review the submitted deliverable"
    : p.state === "changes_requested"
    ? "Freelancer · address revision feedback and resubmit"
    : "Freelancer · submit a deliverable for approval";
  return {
    ...f,
    base,
    charges,
    remaining: f.total > f.settled ? f.total - f.settled : 0n,
    status,
    canIssue,
    payable: active.filter(payableInvoice),
    due: active.filter((i) => BigInt(i.amountMinor) > BigInt(i.paidMinor)).map((
      i,
    ) => i.dueDate).sort()[0],
    next: status === "Paid" || status === "No payment due"
      ? "No payment action needed"
      : status === "Payment processing"
      ? "PayPal · confirm settlement"
      : status === "Payment due" || status === "Partially paid"
      ? "Employer · pay the outstanding invoice"
      : status === "Payment needs attention" ||
          status === "Payment status unknown"
      ? "Employer & freelancer · refresh provider status and review invoice details"
      : canIssue
      ? "Freelancer · issue invoice"
      : status === "Refunded"
      ? "Employer & freelancer · review the refund in PayPal Sandbox"
      : workNext,
  };
}
