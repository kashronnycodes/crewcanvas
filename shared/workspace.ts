import type {
  CanvasLayout,
  Project,
  WorkspaceAnswer,
  WorkspaceIntent,
  WorkspaceSnapshot,
} from "./types.ts";
import { activeAgreement, money, todayIn } from "./domain.ts";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const formats: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
  webm: ["video/webm"],
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  zip: ["application/zip", "application/x-zip-compressed"],
  psd: ["image/vnd.adobe.photoshop"],
  ai: ["application/postscript", "application/pdf"],
  txt: ["text/plain"],
  csv: ["text/csv", "application/vnd.ms-excel"],
  mp3: ["audio/mpeg"],
  wav: ["audio/wav", "audio/x-wav"],
};
export function validateFile(
  file: { name: string; size: number; type: string },
) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const types = formats[ext];
  if (
    !types ||
    (file.type && file.type !== "application/octet-stream" &&
      !types.includes(file.type))
  ) {
    throw new Error(
      "Unsupported file. Use images, video, PDF, Office documents, audio, ZIP, PSD, AI, text or CSV.",
    );
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    throw new Error("Choose a non-empty file up to 25 MB.");
  }
  if (file.name.length > 180 || /[\u0000-\u001f/\\]/.test(file.name)) {
    throw new Error(
      "Choose a filename under 180 characters without path separators.",
    );
  }
  return types[0];
}
// Browser MIME is a hint. Check actual bytes on the server before storing a file.
export function validateFileBytes(name: string, bytes: Uint8Array) {
  const ext = name.split(".").pop()?.toLowerCase();
  const starts = (...values: number[]) =>
    values.every((v, i) => bytes[i] === v);
  const ascii = (offset: number, text: string) =>
    [...text].every((s, i) => bytes[offset + i] === s.charCodeAt(0));
  const valid = ext === "png"
    ? starts(137, 80, 78, 71, 13, 10, 26, 10)
    : ["jpg", "jpeg"].includes(ext ?? "")
    ? starts(255, 216, 255)
    : ext === "webp"
    ? ascii(0, "RIFF") && ascii(8, "WEBP")
    : ext === "gif"
    ? ascii(0, "GIF8")
    : ["pdf", "ai"].includes(ext ?? "")
    ? ascii(0, "%PDF-") || (ext === "ai" && ascii(0, "%!PS"))
    : ["zip", "docx", "pptx", "xlsx"].includes(ext ?? "")
    ? starts(80, 75, 3, 4)
    : ext === "doc"
    ? starts(208, 207, 17, 224, 161, 177, 26, 225)
    : ext === "psd"
    ? ascii(0, "8BPS")
    : ["mp4", "mov"].includes(ext ?? "")
    ? ascii(4, "ftyp") ||
      (ext === "mov" && ["moov", "mdat", "wide"].some((s) => ascii(4, s)))
    : ext === "webm"
    ? starts(26, 69, 223, 163)
    : ext === "wav"
    ? ascii(0, "RIFF") && ascii(8, "WAVE")
    : ext === "mp3"
    ? ascii(0, "ID3") || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    : ["txt", "csv"].includes(ext ?? "")
    ? !bytes.slice(0, 8192).includes(0)
    : false;
  if (!valid) throw new Error("The file contents do not match its extension.");
}
export function approvedTotal(p: Project): bigint {
  // Accepted additions already produce a new accepted agreement with the new total.
  return BigInt(activeAgreement(p)?.amountMinor ?? "0");
}
export function projectFinance(p: Project, verifiedOnly = false) {
  const invoices = p.invoices.filter((i) =>
    !verifiedOnly || i.source === "sandbox"
  );
  const settled = invoices.reduce((sum, i) => sum + BigInt(i.paidMinor), 0n);
  const pending = invoices.filter((i) =>
    !["cancelled", "refunded"].includes(i.state)
  ).reduce((sum, i) => sum + BigInt(i.pendingMinor), 0n);
  const total = approvedTotal(p);
  const remaining = total > settled ? total - settled : 0n;
  return {
    total,
    settled,
    pending,
    awaiting: p.state === "accepted"
      ? (remaining > pending ? remaining - pending : 0n)
      : 0n,
    revisions: p.proposals.filter((x) => x.status === "pending").reduce(
      (s, x) => s + BigInt(x.amountMinor),
      0n,
    ),
  };
}
export function workspaceFinance(s: WorkspaceSnapshot) {
  return s.projects.reduce((sum, p) => {
    const f = projectFinance(p);
    return {
      approved: sum.approved + f.awaiting,
      settled: sum.settled + f.settled,
      pending: sum.pending + f.pending,
      revisions: sum.revisions + f.revisions,
      expenses: sum.expenses + f.total,
    };
  }, { approved: 0n, settled: 0n, pending: 0n, revisions: 0n, expenses: 0n });
}
export function canvasEntities(s: WorkspaceSnapshot) {
  const entities = new Map<
    string,
    { kind: string; projectId?: string; personId?: string }
  >();
  for (const p of s.people) {
    entities.set(p.id, { kind: "person", personId: p.id });
  }
  for (const p of s.projects) {
    for (const kind of ["project", "task", "payment"]) {
      entities.set(`${kind}:${p.id}`, {
        kind,
        projectId: p.id,
        personId: p.workerId,
      });
    }
    for (const d of p.deliveries) {
      entities.set(`delivery:${d.id}`, { kind: "delivery", projectId: p.id });
    }
    for (const r of p.revisions) {
      entities.set(`revision:${r.id}`, { kind: "revision", projectId: p.id });
    }
  }
  for (const f of s.files ?? []) {
    entities.set(`file:${f.id}`, {
      kind: "file",
      projectId: f.projectId ?? undefined,
    });
  }
  return entities;
}
export function connectionMeaning(
  s: WorkspaceSnapshot,
  source: string,
  target: string,
): string | null {
  const entities = canvasEntities(s),
    a = entities.get(source),
    b = entities.get(target);
  if (!a || !b || source === target) return null;
  const pair = `${a.kind}:${b.kind}`;
  const sameProject = !!a.projectId && a.projectId === b.projectId;
  if (pair === "person:task" && a.personId === b.personId) {
    return "Assigned freelancer";
  }
  if (pair === "project:person" && a.personId === b.personId) {
    return "Project freelancer";
  }
  if (sameProject && pair === "project:task") return "Project work";
  if (sameProject && pair === "task:payment") {
    return "Approved work and invoice";
  }
  if (sameProject && pair === "task:delivery") return "Submitted deliverable";
  if (sameProject && pair === "task:revision") return "Revision requested";
  if (sameProject && pair === "revision:delivery") return "Revision feedback";
  if (
    ["task:file", "revision:file"].includes(pair) &&
    (!b.projectId || sameProject)
  ) return "Reference or deliverable file";
  if (
    pair === "file:person" &&
    (!a.projectId ||
      a.projectId &&
        s.projects.find((p) => p.id === a.projectId)?.workerId === b.personId)
  ) return "File collaborator";
  return null;
}
export function validateCanvas(s: WorkspaceSnapshot, layout: CanvasLayout) {
  const entities = canvasEntities(s);
  if (layout.cards?.some((c) => !entities.has(c.id))) {
    throw new Error("Canvas card is outside this workspace.");
  }
  const seen = new Set<string>();
  for (const c of layout.connections ?? []) {
    const pair = `${c.source}>${c.target}`;
    if (seen.has(pair) || !connectionMeaning(s, c.source, c.target)) {
      throw new Error(
        "Connect related workspace objects. Assignments are changed through agreements.",
      );
    }
    seen.add(pair);
  }
}
export function inferIntent(text: string): WorkspaceIntent {
  if (/organize|arrange|layout/i.test(text)) return "organize";
  if (/spent|spend|month|expense/i.test(text)) return "spending";
  if (/overdue|deadline|late/i.test(text)) return "overdue";
  if (/payment|waiting|outstanding|owed/i.test(text)) return "payments";
  if (/progress|today|summar/i.test(text)) return "progress";
  return "help";
}
export function answerWorkspace(
  s: WorkspaceSnapshot,
  intent: WorkspaceIntent,
  mode: "live" | "demo",
  now = new Date(),
): WorkspaceAnswer {
  const today = todayIn(s.timezone, now), highlight: string[] = [];
  const source = mode === "demo"
    ? "Local sample records"
    : "Authorized workspace records";
  let text =
    "Ask about payments, today’s progress, overdue work, monthly spending, or organizing the canvas. I cannot move money or approve work.";
  if (intent === "payments") {
    const pending = s.projects.filter((p) => projectFinance(p).awaiting > 0n);
    pending.forEach((p) =>
      highlight.push(p.workerId, `task:${p.id}`, `payment:${p.id}`)
    );
    text = `${source}: ${
      money(
        pending.reduce((sum, p) => sum + projectFinance(p).awaiting, 0n)
          .toString(),
      )
    } in approved work awaits payment action across ${pending.length} projects. Processing funds and unapproved revision charges are excluded. This is an invoice balance, not payout confirmation.`;
  } else if (intent === "overdue") {
    const overdue = s.projects.filter((p) => {
      const a = activeAgreement(p);
      return a && a.deadline < today && p.state !== "accepted";
    });
    overdue.forEach((p) => highlight.push(`task:${p.id}`, p.workerId));
    text = `${source}: ${overdue.length} overdue projects${
      overdue.length
        ? ": " + overdue.map((p) =>
          `${p.title} (${p.state.replaceAll("_", " ")}, due ${
            activeAgreement(p)!.deadline
          })`
        ).join("; ")
        : ". No overdue accepted agreements"
    }.`;
  } else if (intent === "progress") {
    const events = s.projects.flatMap((p) =>
      p.activity.filter((e) =>
        todayIn(s.timezone, new Date(e.createdAt)) === today
      ).map((e) => {
        highlight.push(`task:${p.id}`);
        return `${p.title}: ${e.text}`;
      })
    );
    events.push(
      ...(s.workspaceActivity ?? []).filter((e) =>
        todayIn(s.timezone, new Date(e.createdAt)) === today
      ).map((e) => e.text),
    );
    text = `${source} for ${today}: ${
      events.length
        ? events.slice(-12).join(" ")
        : "No project activity recorded today."
    } ${
      s.projects.filter((p) => p.state === "submitted").length
    } projects await review.`;
  } else if (intent === "spending") {
    // syncedAt is NOT settlement time. Never misattribute an old payment to this month.
    text = mode === "demo"
      ? "Sample invoice balances are not verified monthly spending. Monthly spending requires timestamped provider transactions."
      : "Monthly spending is calculated from verified PayPal transaction records by the server.";
  } else if (intent === "organize") {
    text =
      "Suggested layout: projects → work → deliverables → payments. Apply layout to arrange these cards; people and file contents stay intact.";
  }
  return { intent, text, highlight: [...new Set(highlight)], mode };
}
