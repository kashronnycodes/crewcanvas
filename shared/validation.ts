import { z } from "zod";
const id = z.uuid();
export const minorSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,8})$/,
    "Enter a non-negative amount up to $999,999.99.",
  );
export const dateSchema = z.iso.date();
export const invitationSchema = z
  .object({
    email: z.email().max(254),
    name: z.string().trim().min(2).max(80),
    role: z.string().trim().min(2).max(80),
  })
  .strict();
export const termsSchema = z
  .object({
    brief: z.string().trim().min(10).max(20000),
    tasks: z.array(z.string().trim().min(1).max(1500)).max(30).optional(),
    deliverables: z.array(z.string().trim().min(1).max(1500)).min(1).max(30),
    amountMinor: minorSchema,
    currency: z.literal("USD"),
    deadline: dateSchema,
    revisionRounds: z.number().int().min(0).max(99),
    paymentDays: z.number().int().min(0).max(90),
  })
  .strict();
export const scopeItemSchema = z
  .object({
    text: z.string().min(1).max(3000),
    classification: z.enum(["likely_included", "potential_extra", "unclear"]),
    explanation: z.string().max(2000),
    uncertainty: z.enum(["low", "medium", "high"]),
    sources: z
      .array(z.object({ clauseId: z.string(), quote: z.string() }).strict())
      .max(10),
  })
  .strict();
export const scopeOutputSchema = z
  .object({
    items: z.array(scopeItemSchema).min(1).max(20),
    questions: z.array(z.string()).max(10),
  })
  .strict();
export const briefOutputSchema = z
  .object({
    tasks: z.array(z.string()).min(1).max(20),
    deliverables: z.array(z.string()).min(1).max(20),
    questions: z.array(z.string()).max(10),
  })
  .strict();
export const driveUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["drive.google.com", "docs.google.com"].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}, "Use an HTTPS Google Drive or Google Docs link.");
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("createProject"),
      workerId: id,
      title: z.string().trim().min(2).max(120),
      terms: termsSchema,
      publish: z.boolean().default(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("proposeAgreement"),
      projectId: id,
      terms: termsSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("decideAgreement"),
      projectId: id,
      agreementId: id,
      accept: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("submitDelivery"),
      projectId: id,
      url: driveUrlSchema,
      label: z.string().trim().min(1).max(80),
      note: z.string().max(3000),
    })
    .strict(),
  z
    .object({
      type: z.literal("submitFileDelivery"),
      projectId: id,
      fileId: id,
      fileVersion: z.number().int().min(0),
      label: z.string().trim().min(1).max(80),
      note: z.string().max(3000),
    })
    .strict(),
  z
    .object({
      type: z.literal("acceptDelivery"),
      projectId: id,
      deliveryId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("requestRevision"),
      projectId: id,
      text: z.string().min(3).max(10000),
      items: z.array(scopeItemSchema).min(1).max(20),
    })
    .strict(),
  z
    .object({
      type: z.literal("respondRevision"),
      projectId: id,
      revisionId: id,
      itemId: id,
      disposition: z.enum(["included", "clarification"]),
      note: z.string().max(2000),
      waiveRound: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("proposeAddition"),
      projectId: id,
      revisionId: id,
      itemId: id,
      description: z.string().min(3).max(3000),
      amountMinor: minorSchema,
      deadline: dateSchema.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("decideProposal"),
      projectId: id,
      proposalId: id,
      accept: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("rebaseProposal"),
      projectId: id,
      proposalId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("discuss"),
      projectId: id,
      text: z.string().trim().min(1).max(3000),
    })
    .strict(),
  z.object({ type: z.literal("simulateInvoice"), projectId: id }).strict(),
  z
    .object({
      type: z.literal("simulatePayment"),
      projectId: id,
      invoiceId: id,
      state: z.enum(["pending", "partial", "paid", "failed"]),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const layoutSchema = z
  .object({
    schemaVersion: z.literal(1),
    version: z.number().int().min(0),
    groups: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1).max(60),
          x: z.number().finite(),
          y: z.number().finite(),
          collapsed: z.boolean(),
          width: z.number().min(220).max(3000),
          height: z.number().min(200).max(3000),
        }),
      )
      .max(30),
    people: z
      .array(
        z.object({
          id,
          groupId: id.nullable(),
          x: z.number().finite(),
          y: z.number().finite(),
        }),
      )
      .max(200),
    cards: z.array(
      z.object({
        id: z.string().min(1).max(100),
        x: z.number().finite(),
        y: z.number().finite(),
        width: z.number().min(220).max(800).optional(),
        height: z.number().min(160).max(800).optional(),
      }).strict(),
    ).max(2000).optional(),
    connections: z.array(
      z.object({ id, source: z.string().max(100), target: z.string().max(100) })
        .strict(),
    ).max(4000).optional(),
    viewport: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
      zoom: z.number().min(0.1).max(3),
    }),
  })
  .strict()
  .superRefine((layout, ctx) => {
    const ids = [...layout.groups, ...layout.people, ...(layout.cards ?? [])]
      .map((x) => x.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Layout nodes must be unique." });
    }
    for (const p of layout.people) {
      if (p.groupId && !layout.groups.some((g) => g.id === p.groupId)) {
        ctx.addIssue({ code: "custom", message: "Unknown group." });
      }
    }
  });
