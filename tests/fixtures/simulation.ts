import { z } from "zod";
import { commandSchema as realSchema } from "../../shared/validation";
import { activeAgreement, assertProjectAccess, DomainError, execute as realExecute, todayIn, uid } from "../../shared/domain";
import type { Project, SessionActor } from "../../shared/types";
export const commandSchema = z.union([realSchema,
 z.object({ type: z.literal("simulateInvoice"), projectId: z.uuid() }).strict(),
 z.object({ type: z.literal("simulatePayment"), projectId: z.uuid(), invoiceId: z.uuid(), state: z.enum(["pending", "partial", "paid", "failed"]) }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export function execute(project: Project, input: Command, actor: SessionActor, options: { demo?: boolean; now?: string } = {}): Project {
 const command = commandSchema.parse(input);
 if (command.type !== "simulateInvoice" && command.type !== "simulatePayment") return realExecute(project, command, actor, options);
 assertProjectAccess(actor, project);
 if (command.projectId !== project.id) throw new Error("Project identifier mismatch.");
 const p = structuredClone(project), now = options.now ?? new Date().toISOString();
 const log = (text: string) => p.activity.push({id:uid(),actorId:actor.id,text,createdAt:now});
 const agreed = () => { const a = activeAgreement(p); if (!a) throw new Error("Accept an agreement before continuing."); return a; };
 const worker = () => { if (actor.role !== "worker" || actor.id !== p.workerId) throw new Error("Only the worker can perform this action."); };
 switch (command.type) {
    case "simulateInvoice": {
      worker();
      if (!options.demo) {
        throw new DomainError(
          "FORBIDDEN",
          "Simulated invoices are available only in demo mode.",
        );
      }
      const a = agreed();
      if (p.state !== "accepted") {
        throw new DomainError(
          "CONFLICT",
          "Accept the delivery before invoicing.",
        );
      }
      const invoiced = p.invoices
        .filter((i) => i.state !== "cancelled")
        .reduce((sum, i) => sum + BigInt(i.amountMinor), 0n);
      const remaining = BigInt(a.amountMinor) - invoiced;
      if (remaining <= 0n) {
        throw new DomainError(
          "CONFLICT",
          "All approved charges are already invoiced.",
        );
      }
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
      if (!options.demo) {
        throw new DomainError(
          "FORBIDDEN",
          "Simulated payments are available only in demo mode.",
        );
      }
      const i = p.invoices.find((x) => x.id === command.invoiceId);
      if (!i) throw new DomainError("NOT_FOUND", "Invoice not found.");
      i.state = command.state;
      i.pendingMinor = command.state === "pending"
        ? (BigInt(i.amountMinor) - BigInt(i.paidMinor)).toString()
        : "0";
      i.paidMinor = command.state === "paid"
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
 p.version += 1; return p;
}
