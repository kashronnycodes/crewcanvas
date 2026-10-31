import { type DragEvent, memo, useMemo, useRef, useState } from "react";
import {
  type Connection,
  Handle,
  type Node,
  type NodeProps,
  NodeResizer,
  Position,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Clock3,
  FileText,
  History,
  Layers3,
  Link2,
  Sparkles,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import type {
  CanvasLayout,
  Project,
  WorkspaceAnswer,
  WorkspaceFile,
  WorkspaceSnapshot,
} from "../../shared/types";
import { activeAgreement, money, todayIn, uid } from "../../shared/domain";
import {
  answerWorkspace,
  connectionMeaning,
  inferIntent,
  projectFinance,
  workspaceFinance,
} from "../../shared/workspace";
import { api, mode } from "../services";
import { files } from "../fileService";
import { FileInspector, FilePreview } from "./WorkspaceFiles";
import Modal from "./Modal";

export type WorkCardData = {
  kind: "project" | "task" | "payment" | "delivery" | "revision" | "file";
  title: string;
  subtitle: string;
  project?: Project;
  file?: WorkspaceFile;
  status: string;
  onOpen: () => void;
  onResize: (width: number, height: number) => void;
  onPay?: () => void;
};
export const WorkCard = memo(
  function WorkCard(
    { data, selected }: NodeProps<Node<{ work: WorkCardData }>>,
  ) {
    const w = data.work,
      f = w.project && projectFinance(w.project),
      amount = w.kind === "payment" && f;
    const Icon = w.kind === "payment"
      ? Wallet
      : w.kind === "revision"
      ? History
      : w.kind === "project"
      ? Layers3
      : FileText;
    return (
      <article className={`work-card kind-${w.kind}`}>
        {w.kind === "file" && (
          <NodeResizer
            isVisible={selected}
            minWidth={240}
            minHeight={220}
            maxWidth={800}
            maxHeight={800}
            onResizeEnd={(_, p) => w.onResize(p.width, p.height)}
          />
        )}
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <button className="work-card-heading nodrag" onClick={w.onOpen}>
          <Icon size={14} />
          <span>{w.kind === "payment" ? "PAYMENT" : w.kind.toUpperCase()}</span>
          <ArrowRight size={13} />
        </button>
        {w.file && (
          <div className="card-file-preview nodrag">
            <FilePreview file={w.file} />
          </div>
        )}
        <button className="work-card-title nodrag" onClick={w.onOpen}>
          {w.title}
        </button>
        <p>{w.subtitle}</p>
        {amount && (
          <strong className="payment-value">
            {money(amount.total.toString())}
            <small>USD · approved total</small>
          </strong>
        )}
        <div
          className={`work-card-status ${
            w.status.includes("paid") || w.status.includes("accepted")
              ? "positive"
              : ""
          }`}
        >
          <span aria-hidden>●</span>
          {w.status}
        </div>
        {w.kind === "payment" && (
          <>
            <small className="payment-source">
              {w.project?.origin === "sample"
                ? "Sample records"
                : "PayPal Sandbox · seller invoice"}
            </small>
            <div className="card-actions nodrag">
              <button onClick={w.onOpen}>Review work</button>
              {w.onPay && <button onClick={w.onPay}>Pay with PayPal</button>}
            </div>
          </>
        )}
      </article>
    );
  },
  (before, after) => {
    const a = before.data.work, b = after.data.work;
    return before.selected === after.selected && a.kind === b.kind &&
      a.title === b.title && a.subtitle === b.subtitle &&
      a.status === b.status && a.project === b.project && a.file === b.file;
  },
);
type Focus = "all" | "tasks" | "people" | "payments" | "files" | "deadlines";
type Options = {
  snapshot: WorkspaceSnapshot;
  layout: CanvasLayout;
  persist: (layout: CanvasLayout) => void;
  flow: ReactFlowInstance;
  onSelect: (
    id: string,
    filter?: "all" | "attention" | "completed",
    projectId?: string,
  ) => void;
  onNotify: (s: string) => void;
};
export function useWorkspaceCanvas(
  { snapshot: s, layout, persist, flow, onSelect, onNotify }: Options,
) {
  const client = useQueryClient(),
    input = useRef<HTMLInputElement>(null),
    container = useRef<HTMLDivElement>(null);
  const latestLayout = useRef({ layout, persist });
  latestLayout.current = { layout, persist };
  const [focus, setFocus] = useState<Focus>("all"),
    [inspector, setInspector] = useState<
      { id: string; left: number; top: number } | null
    >(null),
    [edge, setEdge] = useState<
      { id: string; source: string; target: string } | null
    >(null),
    [timeline, setTimeline] = useState(false),
    [dragging, setDragging] = useState(false),
    [uploads, setUploads] = useState<
      { id: string; name: string; progress: number; error?: string }[]
    >([]),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState<WorkspaceAnswer | null>(null),
    [thinking, setThinking] = useState(false),
    [aiError, setAiError] = useState(""),
    [payment, setPayment] = useState<Project | null>(null);
  const finance = workspaceFinance({
      ...s,
      projects: mode === "demo"
        ? s.projects
        : s.projects.filter((p) => p.origin === "sandbox"),
    }),
    today = todayIn(s.timezone);
  const upcomingUntil = new Date(
    new Date(`${today}T00:00:00Z`).getTime() + 7 * 86400000,
  ).toISOString().slice(0, 10);
  function inspect(id: string, point?: { clientX: number; clientY: number }) {
    const box = container.current?.getBoundingClientRect();
    setInspector({
      id,
      left: Math.max(
        12,
        Math.min(
          (point?.clientX ?? (box?.left ?? 0) + 450) - (box?.left ?? 0) + 20,
          (box?.width ?? 800) - 350,
        ),
      ),
      top: Math.max(
        72,
        Math.min(
          (point?.clientY ?? (box?.top ?? 0) + 100) - (box?.top ?? 0),
          (box?.height ?? 700) - 470,
        ),
      ),
    });
    setEdge(null);
  }
  const workNodes = useMemo(() => {
    const output: Node<{ work: WorkCardData }>[] = [];
    const add = (
      id: string,
      kind: WorkCardData["kind"],
      title: string,
      subtitle: string,
      status: string,
      x: number,
      y: number,
      p?: Project,
      file?: WorkspaceFile,
    ) => {
      const saved = layout.cards?.find((c) => c.id === id);
      output.push({
        id,
        type: "work",
        position: saved ? { x: saved.x, y: saved.y } : { x, y },
        style: {
          width: saved?.width ?? 266,
          ...(kind === "file" ? { height: saved?.height ?? 280 } : {}),
        },
        data: {
          work: {
            kind,
            title,
            subtitle,
            status,
            project: p,
            file,
            onOpen: () => inspect(id),
            onResize: (width, height) => {
              const latest = latestLayout.current,
                card = latest.layout.cards?.find((c) => c.id === id);
              latest.persist({
                ...latest.layout,
                cards: [
                  ...(latest.layout.cards ?? []).filter((c) => c.id !== id),
                  {
                    id,
                    x: card?.x ?? x,
                    y: card?.y ?? y,
                    width,
                    height,
                  },
                ],
              });
            },
            ...(kind === "payment" &&
                p?.invoices.some((i) =>
                  i.recipientUrl &&
                  ["unpaid", "partial", "pending"].includes(i.state)
                )
              ? { onPay: () => setPayment(p) }
              : {}),
          },
        },
      });
    };
    s.projects.forEach((p, i) => {
      const y = 80 + i * 410,
        a = activeAgreement(p),
        person = s.people.find((x) => x.id === p.workerId),
        f = projectFinance(p),
        latest = p.deliveries.at(-1);
      add(
        `project:${p.id}`,
        "project",
        p.title,
        person?.name ?? "Assigned freelancer",
        p.origin === "sample" ? "Sample project" : "Sandbox project",
        1480,
        y,
        p,
      );
      add(
        `task:${p.id}`,
        "task",
        a?.tasks?.[0] ?? p.title,
        `${a?.tasks?.length || a?.deliverables.length || 0} agreed items · ${
          a?.deadline ?? "Awaiting terms"
        }`,
        p.state.replaceAll("_", " "),
        1800,
        y,
        p,
      );
      const status = p.invoices.some((i) => i.state === "failed" || i.error)
        ? "Requires attention"
        : f.pending > 0n
        ? "Processing · not settled"
        : f.total > 0n && f.settled >= f.total
        ? (p.origin === "sample" ? "Sample paid" : "Verified paid")
        : p.invoices.length > 0 &&
            p.invoices.every((i) => i.state === "cancelled")
        ? "Invoice cancelled · reissue required"
        : p.state === "accepted"
        ? "Awaiting payment"
        : "Not yet payable";
      add(
        `payment:${p.id}`,
        "payment",
        person?.name ?? "Freelancer",
        p.title,
        status,
        2440,
        y,
        p,
      );
      p.deliveries.forEach((d, j) =>
        add(
          `delivery:${d.id}`,
          "delivery",
          d.label,
          d.fileId
            ? s.files?.find((f) => f.id === d.fileId)?.name ??
              "Uploaded deliverable"
            : "Google Drive submission",
          d.status.replaceAll("_", " "),
          2120,
          y + j * 190,
          p,
        )
      );
      p.revisions.forEach((r, j) =>
        add(
          `revision:${r.id}`,
          "revision",
          r.text.slice(0, 100),
          `${r.items.length} scope items · recommendations require review`,
          r.items.some((x) => x.disposition !== "resolved")
            ? "Feedback in review"
            : "Resolved",
          2120,
          y + (latest ? 200 : 0) + j * 185,
          p,
        )
      );
    });
    (s.files ?? []).forEach((f) =>
      add(
        `file:${f.id}`,
        "file",
        f.name,
        f.projectId
          ? s.projects.find((p) => p.id === f.projectId)?.title ??
            "Project file"
          : "Workspace reference",
        `Stored · v${f.versions.length}`,
        f.x,
        f.y,
        undefined,
        f,
      )
    );
    return output;
  }, [s, layout, flow]);
  const workEdges = useMemo(() => {
    const result: {
      id: string;
      source: string;
      target: string;
      label?: string;
    }[] = [];
    s.projects.forEach((p) => {
      result.push({
        id: `assigned-${p.id}`,
        source: p.workerId,
        target: `task:${p.id}`,
      }, {
        id: `project-work-${p.id}`,
        source: `project:${p.id}`,
        target: `task:${p.id}`,
      }, {
        id: `work-payment-${p.id}`,
        source: `task:${p.id}`,
        target: `payment:${p.id}`,
      });
      p.deliveries.forEach((d) =>
        result.push({
          id: `delivery-${d.id}`,
          source: `task:${p.id}`,
          target: `delivery:${d.id}`,
        })
      );
      p.revisions.forEach((r) => {
        result.push({
          id: `task-revision-${r.id}`,
          source: `task:${p.id}`,
          target: `revision:${r.id}`,
        });
        const delivery = p.deliveries.filter((d) =>
          d.submittedAt <= r.createdAt
        ).at(-1);
        if (delivery) {
          result.push({
            id: `revision-${r.id}`,
            source: `revision:${r.id}`,
            target: `delivery:${delivery.id}`,
          });
        }
      });
    });
    (s.files ?? []).forEach((f) => {
      if (f.projectId) {
        result.push({
          id: `file-task-${f.id}`,
          source: `task:${f.projectId}`,
          target: `file:${f.id}`,
        });
      }
    });
    for (const c of layout.connections ?? []) {
      if (!result.some((e) => e.source === c.source && e.target === c.target)) {
        result.push(c);
      }
    }
    return result.map((e) => ({
      ...e,
      type: "default",
      style: { stroke: "#c1c9c5", strokeWidth: 1 },
      data: { meaning: connectionMeaning(s, e.source, e.target) },
    }));
  }, [s, layout.connections]);
  const emphasized = new Set<string>();
  if (focus !== "all") {
    for (const n of workNodes) {
      const w = n.data.work;
      if (
        focus === "tasks" && ["task", "project", "revision"].includes(w.kind) ||
        focus === "payments" && w.kind === "payment" ||
        focus === "files" && ["file", "delivery"].includes(w.kind) ||
        focus === "deadlines" && w.project &&
          activeAgreement(w.project)?.deadline &&
          activeAgreement(w.project)!.deadline <= upcomingUntil &&
          w.project.state !== "accepted"
      ) emphasized.add(n.id);
    }
    if (focus === "people") s.people.forEach((p) => emphasized.add(p.id));
    if (["payments", "files", "deadlines"].includes(focus)) {
      const seed = new Set(emphasized);
      workEdges.forEach((e) => {
        if (seed.has(e.source) || seed.has(e.target)) {
          emphasized.add(e.source);
          emphasized.add(e.target);
        }
      });
    }
  }
  const aiHighlights = new Set(answer?.highlight ?? []);
  const relevant = (ids: Set<string>, id: string) =>
    ids.has(id) ||
    layout.groups.some((g) =>
      g.id === id &&
      layout.people.some((p) => p.groupId === g.id && ids.has(p.id))
    );
  const opacity = (id: string) =>
    (focus !== "all" && !relevant(emphasized, id) ||
        aiHighlights.size > 0 && !relevant(aiHighlights, id))
      ? 0.2
      : 1;
  async function upload(chosen: File[], point?: { x: number; y: number }) {
    const failed: string[] = [];
    for (const [i, file] of chosen.entries()) {
      const id = uid();
      setUploads((old) => [...old, { id, name: file.name, progress: 0 }]);
      try {
        await files.upload(
          file,
          {
            x: (point?.x ?? 450) + i * 35,
            y: (point?.y ?? 400) + i * 35,
            projectId: null,
          },
          (progress) =>
            setUploads((old) =>
              old.map((u) => u.id === id ? { ...u, progress } : u)
            ),
        );
        setUploads((old) => old.filter((u) => u.id !== id));
      } catch (e) {
        failed.push(file.name);
        setUploads((old) =>
          old.map((u) =>
            u.id === id ? { ...u, error: (e as Error).message } : u
          )
        );
      }
    }
    await client.invalidateQueries({ queryKey: ["workspace"] });
    if (chosen.length > failed.length) {
      onNotify(
        `${
          chosen.length - failed.length
        } file(s) saved. Select a card to attach, rename or preview.`,
      );
    }
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) {
      void upload(
        Array.from(e.dataTransfer.files),
        flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
      );
    }
  }
  async function connect(c: Connection) {
    if (!c.source || !c.target || !connectionMeaning(s, c.source, c.target)) {
      onNotify(
        "Connect related objects: assigned person → task, task → file or payment, project → task or person, revision → deliverable.",
      );
      return;
    }
    if (workEdges.some((e) => e.source === c.source && e.target === c.target)) {
      onNotify("These objects are already connected.");
      return;
    }
    const targetFile = s.files?.find((f) => `file:${f.id}` === c.target);
    const project = s.projects.find((p) =>
      `task:${p.id}` === c.source ||
      p.revisions.some((r) => `revision:${r.id}` === c.source)
    );
    try {
      if (targetFile && project && !targetFile.projectId) {
        await files.update(targetFile, { projectId: project.id });
        await client.invalidateQueries({ queryKey: ["workspace"] });
        onNotify(
          "File attached to the project. Assigned freelancers can now access it.",
        );
        return;
      }
      persist({
        ...layout,
        connections: [...(layout.connections ?? []), {
          id: uid(),
          source: c.source,
          target: c.target,
        }],
      });
    } catch (error) {
      onNotify((error as Error).message);
    }
  }
  function showProject(id: string) {
    const ids = new Set([
      `project:${id}`,
      `task:${id}`,
      `payment:${id}`,
      ...(s.projects.find((p) => p.id === id)?.deliveries.map((d) =>
        `delivery:${d.id}`
      ) ?? []),
    ]);
    void flow.fitView({
      nodes: workNodes.filter((n) => ids.has(n.id)),
      padding: 0.15,
      maxZoom: 0.9,
      duration: 350,
    });
  }
  function organize() {
    const cards = workNodes.map((n) => {
      const w = n.data.work,
        index = s.projects.findIndex((p) => p.id === w.project?.id),
        p = w.project;
      const offset = w.kind === "delivery"
        ? (p?.deliveries.findIndex((d) => n.id === `delivery:${d.id}`) ?? 0) *
          190
        : w.kind === "revision"
        ? (p?.deliveries.length ?? 0) * 190 +
          (p?.revisions.findIndex((r) => n.id === `revision:${r.id}`) ?? 0) *
            185
        : 0;
      const row = s.projects.slice(0, Math.max(0, index)).reduce(
        (sum, p) =>
          sum +
          Math.max(
            410,
            p.deliveries.length * 190 + p.revisions.length * 185 + 40,
          ),
        0,
      );
      return {
        id: n.id,
        x: w.kind === "file"
          ? 2780
          : w.kind === "project"
          ? 1480
          : w.kind === "task"
          ? 1800
          : w.kind === "payment"
          ? 2440
          : 2120,
        y: w.kind === "file"
          ? 80 + (s.files?.findIndex((f) => f.id === w.file?.id) ?? 0) * 320
          : 80 + row + offset,
        width: typeof n.style?.width === "number" ? n.style.width : 266,
        ...(n.style?.height ? { height: Number(n.style.height) } : {}),
      };
    });
    persist({ ...layout, cards });
    setAnswer(null);
  }
  async function ask(text: string) {
    setThinking(true);
    setAiError("");
    try {
      const result: WorkspaceAnswer = mode === "demo"
        ? answerWorkspace(s, inferIntent(text), "demo")
        : await api("ai/workspace", { text });
      setAnswer(result);
      if (result.highlight.length) {
        void flow.fitView({
          nodes: result.highlight.map((id) => ({ id })),
          padding: 0.25,
          maxZoom: 0.8,
          duration: 350,
        });
      }
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }
  const selectedFile = s.files?.find((f) => `file:${f.id}` === inspector?.id),
    person = s.people.find((p) => p.id === inspector?.id),
    work = workNodes.find((n) => n.id === inspector?.id)?.data.work,
    p = work?.project;
  const events = [
    ...(s.workspaceActivity ?? []),
    ...s.projects.flatMap((p) =>
      p.activity.map((e) => ({ ...e, text: `${p.title} · ${e.text}` }))
    ),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
  const ui = (
    <>
      <div className="workspace-focus nodrag">
        <span>Focus</span>
        {([
          "all",
          "tasks",
          "people",
          "payments",
          "files",
          "deadlines",
        ] as Focus[]).map((f) => (
          <button
            key={f}
            aria-pressed={focus === f}
            onClick={() => {
              setFocus(f);
              setAnswer(null);
            }}
          >
            {f === "all" ? "Everything" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          aria-label="Open activity timeline"
          onClick={() => setTimeline(!timeline)}
        >
          <History size={16} />
        </button>
      </div>
      <div className="workflow-jump">
        <Layers3 size={14} />
        <select
          aria-label="Explore project workflow"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value === "team") {
              void flow.fitView({
                nodes: layout.people.map((p) => ({ id: p.id })),
                padding: 0.2,
                maxZoom: 1,
                duration: 350,
              });
            } else if (e.target.value) showProject(e.target.value);
          }}
        >
          <option value="">Explore a project…</option>
          <option value="team">People & role groups</option>
          {s.projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <button onClick={() => input.current?.click()}>
          <Upload size={14} />Upload
        </button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = "";
          const box = container.current?.getBoundingClientRect();
          void upload(
            chosen,
            box
              ? flow.screenToFlowPosition({
                x: box.left + box.width / 2,
                y: box.top + box.height / 2,
              })
              : undefined,
          );
        }}
      />
      <div className="financial-flow">
        <Wallet size={16} />
        <span>{mode === "demo" ? "Sample flow" : "Sandbox flow"}</span>
        <button
          onClick={() => {
            setFocus("payments");
            setAnswer(null);
          }}
        >
          <strong>{money(finance.approved.toString())}</strong> awaiting action
        </button>
        <span>
          <strong>{money(finance.settled.toString())}</strong>{" "}
          {mode === "demo" ? "sample settled" : "verified settled"}
        </span>
        <span>
          <strong>{money(finance.revisions.toString())}</strong>{" "}
          revision proposals
        </span>
        <details className="finance-details">
          <summary aria-label="Show financial flow details">···</summary>
          <div>
            <strong>
              {mode === "demo"
                ? "Sample financial flow"
                : "Verified Sandbox records"}
            </strong>
            <dl>
              <dt>Approved commitments</dt>
              <dd>{money(finance.expenses.toString())}</dd>
              <dt>Accepted work awaiting action</dt>
              <dd>{money(finance.approved.toString())}</dd>
              <dt>Settled seller invoices</dt>
              <dd>{money(finance.settled.toString())}</dd>
              <dt>Processing · not settled</dt>
              <dd>{money(finance.pending.toString())}</dd>
              <dt>Unapproved revision proposals</dt>
              <dd>{money(finance.revisions.toString())}</dd>
            </dl>
            <p>
              USD. Commitments and revision proposals are not money spent.
              Seller invoice settlement does not establish a marketplace payout.
            </p>
          </div>
        </details>
      </div>
      {dragging && (
        <div className="canvas-drop-zone">
          <Upload size={32} />
          <strong>Drop it into the conversation.</strong>
          <span>Files become persistent cards, right here.</span>
        </div>
      )}
      {uploads.length > 0 && (
        <div className="upload-tray" aria-live="polite">
          {uploads.map((u) => (
            <div key={u.id}>
              <strong>{u.name}</strong>
              {u.error
                ? (
                  <>
                    <p role="alert">{u.error}</p>
                    <button
                      onClick={() =>
                        setUploads((old) => old.filter((x) => x.id !== u.id))}
                    >
                      Dismiss
                    </button>
                  </>
                )
                : (
                  <>
                    <progress value={u.progress} max={100} />
                    <span>
                      {u.progress === 99
                        ? "Saving securely…"
                        : `${u.progress}%`}
                    </span>
                  </>
                )}
            </div>
          ))}
        </div>
      )}
      <div className="workspace-command">
        {(answer || aiError) && (
          <div className="command-answer" role="status">
            <button
              className="answer-close"
              aria-label="Clear workspace answer"
              onClick={() => {
                setAnswer(null);
                setAiError("");
              }}
            >
              <X size={14} />
            </button>
            <small>
              {mode === "demo"
                ? "DETERMINISTIC DEMO ASSISTANT"
                : "AI INTENT · SERVER-CALCULATED RECORDS"}
            </small>
            <p>{aiError || answer?.text}</p>
            {answer?.intent === "organize" && (
              <button className="button secondary" onClick={organize}>
                Apply suggested layout
              </button>
            )}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) void ask(question);
          }}
        >
          <Sparkles size={18} />
          <input
            aria-label="Ask your workspace"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask your workspace…"
            maxLength={2000}
            minLength={3}
            required
          />
          <button disabled={thinking} aria-label="Run workspace command">
            {thinking ? <Clock3 size={16} /> : <ArrowRight size={17} />}
          </button>
        </form>
        <div className="command-suggestions">
          {["Waiting for payment", "Today’s progress", "Overdue work"].map(
            (q) => (
              <button
                key={q}
                disabled={thinking}
                onClick={() => {
                  setQuestion(q);
                  void ask(q);
                }}
              >
                {q}
              </button>
            ),
          )}
        </div>
      </div>
      {inspector && (
        <aside
          className="canvas-inspector nodrag nowheel"
          style={{ left: inspector.left, top: inspector.top }}
          aria-label="Canvas object inspector"
          onKeyDown={(e) => {
            if (e.key === "Escape") setInspector(null);
          }}
        >
          {selectedFile
            ? (
              <FileInspector
                key={`${selectedFile.id}-${selectedFile.version}`}
                file={selectedFile}
                snapshot={s}
                onClose={() => setInspector(null)}
                onNotify={onNotify}
              />
            )
            : (
              <>
                <div className="inspector-heading">
                  <span>
                    {person
                      ? person.accessRole === "employer"
                        ? "WORKSPACE OWNER"
                        : "FREELANCER"
                      : work?.kind.toUpperCase()}
                  </span>
                  <button
                    aria-label="Close inspector"
                    onClick={() => setInspector(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                <h3>{person?.name ?? work?.title}</h3>
                <p>{person?.role ?? work?.subtitle}</p>
                {person && (
                  <>
                    <div className="inspector-metrics">
                      <span>
                        {s.projects.filter((p) => p.workerId === person.id)
                          .length} assigned
                      </span>
                      <span>
                        {s.projects.filter((p) =>
                          p.workerId === person.id && p.state === "accepted"
                        ).length} accepted
                      </span>
                      <span>
                        {s.projects.filter((p) =>
                          p.workerId === person.id &&
                          p.state === "changes_requested"
                        ).length} in revision
                      </span>
                    </div>
                    <small>
                      {mode === "demo" ? "Sample" : "Sandbox"}{" "}
                      approved awaiting action · {money(
                        s.projects.filter((p) =>
                          p.workerId === person.id &&
                          (mode === "demo" || p.origin === "sandbox")
                        )
                          .reduce(
                            (sum, p) => sum + projectFinance(p).awaiting,
                            0n,
                          ).toString(),
                      )}
                    </small>
                    {s.projects.filter((p) => p.workerId === person.id).map(
                      (p) => (
                        <button
                          className="inspector-project"
                          key={p.id}
                          onClick={() => {
                            setInspector(null);
                            showProject(p.id);
                          }}
                        >
                          {p.title}
                          <ArrowRight size={13} />
                        </button>
                      ),
                    )}
                    <button
                      className="button primary"
                      onClick={() => onSelect(person.id)}
                    >
                      Projects & payment history
                    </button>
                  </>
                )}
                {p && (
                  <>
                    <span className="pill">{p.state.replaceAll("_", " ")}</span>
                    <small>
                      Agreed deadline ·{" "}
                      {activeAgreement(p)?.deadline ?? "Pending agreement"}
                    </small>
                    <p>{activeAgreement(p)?.brief}</p>
                    {work?.kind === "payment" && (
                      <>
                        <strong>
                          {money(projectFinance(p).total.toString())} approved
                        </strong>
                        <small>
                          {money(projectFinance(p).settled.toString())}{" "}
                          settled ·{" "}
                          {money(projectFinance(p).pending.toString())}{" "}
                          processing
                        </small>
                        <p>
                          {p.origin === "sample"
                            ? "Sample invoice history; no real transaction."
                            : "Seller invoicing is supported. Marketplace payouts are not configured. Paid means verified seller invoice settlement."}
                        </p>
                      </>
                    )}
                    <button
                      className="button primary"
                      onClick={() => onSelect(p.workerId, "all", p.id)}
                    >
                      {p.state === "submitted"
                        ? "Review & approve / request revision"
                        : "Open project details"}
                    </button>
                  </>
                )}
              </>
            )}
        </aside>
      )}
      {edge && (
        <aside className="connection-inspector">
          <button
            aria-label="Close connection details"
            onClick={() => setEdge(null)}
          >
            <X size={14} />
          </button>
          <Link2 size={16} />
          <strong>
            {connectionMeaning(s, edge.source, edge.target) ??
              "Team organization"}
          </strong>
          <small>{edge.source} → {edge.target}</small>
          {layout.connections?.some((c) => c.id === edge.id) && (
            <button
              onClick={() => {
                persist({
                  ...layout,
                  connections: layout.connections?.filter((c) =>
                    c.id !== edge.id
                  ),
                });
                setEdge(null);
              }}
            >
              Remove visual connection
            </button>
          )}
        </aside>
      )}
      {timeline && (
        <aside className="workspace-timeline">
          <div className="inspector-heading">
            <span>WORKSPACE ACTIVITY</span>
            <button
              aria-label="Close timeline"
              onClick={() => setTimeline(false)}
            >
              <X size={16} />
            </button>
          </div>
          {events.length
            ? events.map((e) => (
              <div className="timeline-event" key={e.id}>
                <i />
                <p>{e.text}</p>
                <small>
                  {new Date(e.createdAt).toLocaleString(undefined, {
                    timeZone: s.timezone,
                  })}
                </small>
              </div>
            ))
            : (
              <p>
                No activity recorded yet. Create a task or upload your first
                file.
              </p>
            )}
        </aside>
      )}
      {payment && (
        <Modal
          title="Open PayPal Sandbox payment?"
          description="You authorize payment on PayPal’s hosted Sandbox page."
          onClose={() => setPayment(null)}
        >
          <p>
            {payment.title} ·{" "}
            {money(projectFinance(payment).awaiting.toString())}{" "}
            approved balance awaiting action. Opening this page does not verify
            settlement.
          </p>
          <p>
            Sign in with the separate personal Sandbox payer account. Return
            here after payment; status updates after server verification.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setPayment(null)}
            >
              Cancel
            </button>
            <a
              className="button primary"
              href={payment.invoices.find((i) =>
                i.recipientUrl &&
                ["unpaid", "partial", "pending"].includes(i.state)
              )?.recipientUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setPayment(null)}
            >
              Continue to PayPal Sandbox
            </a>
          </div>
        </Modal>
      )}
    </>
  );
  return {
    workNodes: workNodes.map((n) => ({
      ...n,
      selected: inspector?.id === n.id,
      style: { ...n.style, opacity: opacity(n.id) },
    })),
    workEdges,
    opacity,
    ui,
    container,
    connect,
    drop,
    dragOver: (e: DragEvent) => {
      if (e.dataTransfer.types.includes("Files")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }
    },
    dragLeave: (e: DragEvent) => {
      if (
        !e.currentTarget.contains(e.relatedTarget as globalThis.Node)
      ) setDragging(false);
    },
    inspect,
    selectPerson: (id: string, filter?: "all" | "attention" | "completed") =>
      filter && filter !== "all" ? onSelect(id, filter) : inspect(id),
    edgeClick: (e: { id: string; source: string; target: string }) => {
      setEdge(e);
      setInspector(null);
    },
    paneClick: () => {
      setInspector(null);
      setEdge(null);
    },
  };
}
