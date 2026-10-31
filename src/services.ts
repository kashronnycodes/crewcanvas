import { createClient } from "@supabase/supabase-js";
import type {
  BriefSuggestion,
  CanvasLayout,
  ScopeAnalysis,
  WorkspaceSnapshot,
} from "../shared/types";
import {
  DomainError,
  execute,
  makeAgreement,
  uid,
  verifySources,
} from "../shared/domain";
import {
  type Command,
  commandSchema,
  invitationSchema,
  layoutSchema,
} from "../shared/validation";
import { createDemoWorkspace, migrateDemoRoster } from "./demoRoster";
import { validateCanvas } from "../shared/workspace";
export const mode = import.meta.env.VITE_APP_MODE === "integrated"
  ? "integrated"
  : "demo";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
const storageKey = "crewcanvas.demo.v1";
let memory: WorkspaceSnapshot | undefined;
function readDemo(): WorkspaceSnapshot {
  if (memory) return structuredClone(memory);
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      layoutSchema.parse(parsed.layout);
      if (
        parsed.people?.length &&
        parsed.projects?.every((p: { version: number }) =>
          Number.isInteger(p.version)
        )
      ) {
        if (migrateDemoRoster(parsed)) storeDemo(parsed);
        return parsed;
      }
    }
  } catch {
    /* A malformed local demo is replaced with a known seed. */
  }
  const seeded = createDemoWorkspace();
  storeDemo(seeded);
  return structuredClone(seeded);
}
function storeDemo(s: WorkspaceSnapshot) {
  localStorage.setItem(storageKey, JSON.stringify(s));
  memory = structuredClone(s);
}
export interface CrewRepository {
  load(): Promise<WorkspaceSnapshot>;
  command(command: Command, requestId: string): Promise<void>;
  saveLayout(layout: CanvasLayout): Promise<CanvasLayout>;
}
export interface ScopeAssistant {
  extract(brief: string): Promise<BriefSuggestion>;
  compare(projectId: string, text: string): Promise<ScopeAnalysis>;
}
export interface PaymentGateway {
  issue(projectId: string, requestId: string): Promise<void>;
  reconcile(projectId: string): Promise<void>;
}
export async function api(path: string, body?: unknown, requestId?: string) {
  if (!supabase) {
    throw new Error(
      "Integrated mode needs a Supabase URL and publishable key. Configure .env and restart.",
    );
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to continue.");
  const response = await fetch(`${url}/functions/v1/crew-api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: key,
      "Content-Type": "application/json",
      ...(requestId ? { "Idempotency-Key": requestId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message ?? "The request failed. Try again.");
  }
  return result;
}
export function mutateDemo<T>(
  change: (s: WorkspaceSnapshot, actorId: string) => T,
): T {
  if (mode !== "demo") throw new Error("Local demo only.");
  const s = readDemo();
  const result = change(s, demoActorId ?? s.actorId);
  storeDemo(s);
  return result;
}
let demoActorId: string | null = null;
export function setDemoActor(id: string) {
  demoActorId = id;
}
const processed = new Set<string>();
export const repository: CrewRepository = mode === "demo"
  ? {
    async load() {
      const s = readDemo();
      s.actorId = demoActorId ?? s.actorId;
      const actor = s.people.find((p) => p.id === s.actorId)!;
      if (actor.accessRole === "worker") {
        s.people = s.people.filter((p) => p.id === actor.id);
        s.projects = s.projects.filter((p) => p.workerId === actor.id);
        s.files = (s.files ?? []).filter((f) =>
          s.projects.some((p) => p.id === f.projectId)
        );
        s.workspaceActivity = (s.workspaceActivity ?? []).filter((e) =>
          s.projects.some((p) => p.id === e.projectId)
        );
        s.layout = { ...s.layout, people: [], groups: [] };
      }
      return s;
    },
    async command(input, requestId) {
      if (processed.has(requestId)) return;
      const command = commandSchema.parse(input);
      const s = readDemo();
      const person = s.people.find(
        (p) => p.id === (demoActorId ?? s.actorId),
      )!;
      const actor = {
        id: person.id,
        role: person.accessRole,
        workspaceId: s.id,
      };
      if (command.type === "createProject") {
        if (actor.role !== "employer") {
          throw new DomainError(
            "FORBIDDEN",
            "Only the employer can create projects.",
          );
        }
        if (
          !s.people.some(
            (p) => p.id === command.workerId && p.accessRole === "worker",
          )
        ) {
          throw new Error("Choose a workspace worker.");
        }
        const a = makeAgreement(command.terms, actor.id, null);
        a.status = command.publish ? "proposed" : "draft";
        s.projects.push({
          id: uid(),
          workspaceId: s.id,
          workerId: command.workerId,
          title: command.title,
          state: "awaiting_agreement",
          origin: "sample",
          activeAgreementId: null,
          agreements: [a],
          deliveries: [],
          revisions: [],
          proposals: [],
          invoices: [],
          activity: [
            {
              id: uid(),
              actorId: actor.id,
              text: "Proposed a new project agreement.",
              createdAt: new Date().toISOString(),
            },
          ],
          version: 0,
        });
      } else {
        const index = s.projects.findIndex(
          (p) => p.id === command.projectId,
        );
        if (index < 0) throw new Error("Project not found.");
        if (command.type === "submitFileDelivery") {
          const file = s.files?.find((f) =>
            f.id === command.fileId && f.projectId === command.projectId
          );
          if (!file?.versions[command.fileVersion]) {
            throw new Error(
              "Attach an existing file version to this project first.",
            );
          }
        }
        s.projects[index] = execute(s.projects[index], command, actor, {
          demo: true,
        });
      }
      storeDemo(s);
      processed.add(requestId);
    },
    async saveLayout(layout) {
      const s = readDemo();
      const person = s.people.find(
        (p) => p.id === (demoActorId ?? s.actorId),
      )!;
      if (person.accessRole !== "employer") {
        throw new Error("Only the employer can edit the canvas.");
      }
      const validated = layoutSchema.parse(layout);
      validateCanvas(s, validated);
      if (validated.version !== s.layout.version) {
        throw new Error("Layout changed. Reload the latest workspace.");
      }
      s.layout = { ...validated, version: validated.version + 1 };
      storeDemo(s);
      return s.layout;
    },
  }
  : {
    async load() {
      return api("snapshot");
    },
    async command(command, requestId) {
      await api("command", command, requestId);
    },
    async saveLayout(layout) {
      return api("layout", layout);
    },
  };
export const scopeAssistant: ScopeAssistant = mode === "demo"
  ? {
    async extract(brief) {
      await new Promise((r) => setTimeout(r, 600));
      const parts = brief
        .split(/[\n.!?]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 8);
      return {
        tasks: parts.slice(0, 5).map((s) => `Review and prepare: ${s}`),
        deliverables: parts.slice(0, 3).length
          ? parts.slice(0, 3)
          : ["Final export based on the brief"],
        questions: [
          "Confirm the final format and any reference assets before accepting.",
        ],
        mode: "demo",
      };
    },
    async compare(projectId, text) {
      await new Promise((r) => setTimeout(r, 650));
      const p = readDemo().projects.find((p) => p.id === projectId);
      const a = p?.agreements.find((a) => a.id === p.activeAgreementId);
      if (!a) {
        throw new Error("Accept an agreement before comparing scope.");
      }
      const items = text
        .split(/\s+and\s+|\n|;/i)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const correction = /spell|typo|technical|fix/i.test(s);
          const extra = /second|new |extra|another|add /i.test(s);
          const match = a.clauses.find((c) =>
            correction
              ? /spelling|correction|technical/i.test(c.text)
              : /second concept|alternate ending/i.test(c.text)
          );
          const quote = match?.text
            .split(/(?<=[.!?])\s+/)
            .find((sentence) =>
              correction
                ? /spelling|correction|technical/i.test(sentence)
                : /second concept|alternate ending/i.test(sentence)
            ) ?? match?.text;
          return {
            text: s,
            classification: correction
              ? ("likely_included" as const)
              : extra
              ? ("potential_extra" as const)
              : ("unclear" as const),
            explanation: correction
              ? "This appears to correct an existing deliverable."
              : extra
              ? "This appears to add a deliverable or direction."
              : "Ask both parties to clarify the expected result.",
            uncertainty: match && (correction || extra)
              ? ("medium" as const)
              : ("high" as const),
            sources: match ? [{ clauseId: match.id, quote: quote! }] : [],
          };
        });
      verifySources(items, a);
      return {
        items,
        questions: items.some((i) => i.classification === "unclear")
          ? ["What specific output should this change produce?"]
          : [],
        mode: "demo",
      };
    },
  }
  : {
    async extract(brief) {
      return api("ai/brief", { brief });
    },
    async compare(projectId, text) {
      return api("ai/revision", { projectId, text });
    },
  };
export const payments: PaymentGateway = {
  async issue(projectId, requestId) {
    if (mode === "demo") {
      await repository.command(
        { type: "simulateInvoice", projectId },
        requestId,
      );
    } else await api("payments/issue", { projectId }, requestId);
  },
  async reconcile(projectId) {
    if (mode === "integrated") await api("payments/reconcile", { projectId });
  },
};
export function resetDemo() {
  if (mode !== "demo") throw new Error("Reset is available only in demo mode.");
  processed.clear();
  demoActorId = null;
  storeDemo(createDemoWorkspace());
}
export async function inviteMember(email: string, name: string, role: string) {
  const value = invitationSchema.parse({ email, name, role });
  if (mode === "demo") {
    const snapshot = readDemo();
    const actor = snapshot.people.find(
      (p) => p.id === (demoActorId ?? snapshot.actorId),
    );
    if (actor?.accessRole !== "employer") {
      throw new Error("Only the employer can invite members.");
    }
    if (
      snapshot.people.some((p) => p.email.toLowerCase() === email.toLowerCase())
    ) {
      throw new Error("This person is already in the workspace.");
    }
    const id = uid();
    snapshot.people.push({
      id,
      ...value,
      accessRole: "worker",
      color: "#ccd4e8",
      initials: name
        .split(" ")
        .map((s) => s[0])
        .slice(0, 2)
        .join(""),
      connected: false,
    });
    snapshot.layout.people.push({ id, groupId: null, x: 500, y: 640 });
    snapshot.layout.version++;
    storeDemo(snapshot);
    return {
      url: "",
      message:
        `${name} was added to the local sample workspace. This invitation is simulated; no email was sent. Real sign-in requires integrated mode.`,
    };
  }
  return api("invite", value);
}
