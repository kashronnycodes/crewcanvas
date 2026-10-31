import AgreementHistory from "./AgreementHistory";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Link,
  MessageSquare,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import type {
  Agreement,
  Person,
  Project,
  ScopeAnalysis,
  WorkspaceSnapshot,
} from "../../shared/types";
import {
  activeAgreement,
  invoiceAttention,
  money,
  parseAmount,
  todayIn,
} from "../../shared/domain";
import { type Command, driveUrlSchema } from "../../shared/validation";
import { mode, scopeAssistant } from "../services";
import Avatar from "./Avatar";
import ProjectForm from "./ProjectForm";
import { FilePicker } from "./WorkspaceFiles";
import { openFile } from "../fileService";
const workLabels: Record<string, string> = {
  awaiting_agreement: "Awaiting agreement",
  in_progress: "In progress",
  submitted: "Awaiting review",
  changes_requested: "Changes requested",
  accepted: "Work accepted",
};
const tabs = [
  { id: "overview", icon: FileText, label: "Overview" },
  { id: "deliverables", icon: Link, label: "Deliverables" },
  { id: "revisions", icon: MessageSquare, label: "Revisions" },
  { id: "payments", icon: Wallet, label: "Payments" },
  { id: "activity", icon: History, label: "Activity" },
];
type Filter = "all" | "attention" | "completed";
export default function ProjectDrawer({
  person,
  snapshot,
  initialFilter,
  initialProjectId,
  onClose,
  onCommand,
  onIssue,
  onRefresh,
  busy,
  onNotify,
}: {
  person: Person;
  snapshot: WorkspaceSnapshot;
  initialFilter: Filter;
  initialProjectId?: string;
  onClose: () => void;
  onCommand: (c: Command) => Promise<boolean>;
  onIssue: (id: string) => Promise<boolean>;
  onRefresh: (id: string) => Promise<boolean>;
  busy: boolean;
  onNotify: (s: string) => void;
}) {
  const today = todayIn(snapshot.timezone);
  const allProjects = snapshot.projects.filter((p) => p.workerId === person.id);
  const projects = allProjects.filter(
    (p) =>
      initialFilter === "all" ||
      (initialFilter === "completed"
        ? p.state === "accepted"
        : p.invoices.some((i) => invoiceAttention(i, today))),
  );
  const [selectedId, setSelectedId] = useState(
    initialProjectId ?? projects[0]?.id ?? "",
  );
  const [tab, setTab] = useState(
    initialFilter === "attention" ? "payments" : "overview",
  );
  const [editTerms, setEditTerms] = useState(false);
  useEffect(() => {
    setSelectedId(initialProjectId ?? projects[0]?.id ?? "");
    setTab(initialFilter === "attention" ? "payments" : "overview");
  }, [person.id, initialFilter, initialProjectId]);
  const p = projects.find((p) => p.id === selectedId) ?? projects[0];
  const a = p && activeAgreement(p);
  const employer =
    snapshot.people.find((p) => p.id === snapshot.actorId)?.accessRole ===
      "employer";
  return (
    <>
      <Dialog.Root
        open
        onOpenChange={(open) => !open && onClose()}
        modal={window.matchMedia("(max-width: 600px)").matches}
      >
        <Dialog.Portal>
          <Dialog.Content
            className="worker-drawer"
            aria-describedby="worker-description"
            onInteractOutside={(e) => {
              if (
                (e.target as HTMLElement).closest(
                  ".person-node, .group-node, .modal-content, .canvas-dialog, .react-flow, .topbar, .workspace-toolbar, .person-card",
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <div className="drawer-top">
              <span className="eyebrow">THE PEOPLE BEHIND THE WORK</span>
              <Dialog.Close
                className="icon-button"
                aria-label="Close worker details"
              >
                <X size={20} />
              </Dialog.Close>
            </div>
            <div className="worker-profile">
              <Avatar person={person} size={64} />
              <div>
                <Dialog.Title>{person.name}</Dialog.Title>
                <Dialog.Description id="worker-description">
                  {person.role}
                  <span className="profile-online">● Active member</span>
                </Dialog.Description>
              </div>
            </div>
            {person.connected && (
              <div className="seller-note">
                <ShieldCheck size={14} />
                {mode === "demo"
                  ? "Sandbox seller in integrated build · payments simulated here"
                  : "Connected PayPal sandbox seller"}
              </div>
            )}
            <div className="project-selector">
              <label htmlFor="project-select">
                PROJECT{" "}
                <span>
                  {projects.length}{" "}
                  {initialFilter !== "all" ? "matching" : "assigned"}
                </span>
              </label>
              <div>
                <select
                  id="project-select"
                  value={p?.id ?? ""}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} />
              </div>
            </div>
            {p
              ? (
                <>
                  <div className="project-status-row">
                    <span className={`pill work-${p.state}`}>
                      {p.state === "accepted"
                        ? <Check size={12} />
                        : <span className="tiny-dot" />}
                      {workLabels[p.state]}
                    </span>
                    <span className="source-label">
                      {p.origin === "sample" ? "Sample data" : "PayPal Sandbox"}
                    </span>
                  </div>
                  <div
                    className="drawer-tabs"
                    role="tablist"
                    aria-label="Project details"
                  >
                    {tabs.map((t) => (
                      <button
                        key={t.id}
                        role="tab"
                        id={`tab-${t.id}`}
                        aria-controls="project-tab-panel"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                      >
                        <t.icon size={15} />
                        <span>{t.label}</span>
                        {t.id === "revisions" &&
                          p.proposals.some((x) => x.status === "pending") && (
                          <i />
                        )}
                      </button>
                    ))}
                  </div>
                  <div
                    className="drawer-body"
                    role="tabpanel"
                    id="project-tab-panel"
                    aria-labelledby={`tab-${tab}`}
                  >
                    {tab === "overview" && (
                      <>
                        <div className="section-heading">
                          <h3>The agreement</h3>
                          {employer && (
                            <button
                              className="text-button"
                              onClick={() => setEditTerms(true)}
                            >
                              Propose changes
                            </button>
                          )}
                        </div>
                        {a
                          ? (
                            <>
                              <div className="agreement-status">
                                <ShieldCheck size={16} />
                                <span>
                                  Mutually accepted
                                  <small>
                                    Version {p.agreements.indexOf(a) + 1}{" "}
                                    · accepted terms are preserved
                                  </small>
                                </span>
                              </div>
                              <div className="overview-numbers">
                                <div>
                                  <span>AGREED PRICE</span>
                                  <strong>
                                    {money(a.amountMinor)}
                                    <small>USD</small>
                                  </strong>
                                </div>
                                <div>
                                  <span>DEADLINE</span>
                                  <strong className="date-number">
                                    {new Date(
                                      `${a.deadline}T12:00:00`,
                                    ).toLocaleDateString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                    })}
                                    <CalendarDays size={16} />
                                  </strong>
                                </div>
                              </div>
                              <div className="brief-block">
                                <h4>The brief</h4>
                                <p>{a.brief}</p>
                              </div>
                              <h4>What we're making</h4>
                              <ul className="deliverable-checklist">
                                {a.deliverables.map((d, i) => (
                                  <li key={i}>
                                    <span className="check-outline">
                                      <Check size={11} />
                                    </span>
                                    {d}
                                  </li>
                                ))}
                              </ul>
                              <div className="agreement-meta">
                                <span>
                                  <MessageSquare size={15} />
                                  {p.revisions.filter((r) => r.roundConsumed)
                                    .length} / {a.revisionRounds}{" "}
                                  revision rounds used
                                </span>
                                <span>
                                  <Clock3 size={15} />
                                  Payment due {a.paymentDays}{" "}
                                  days after acceptance
                                </span>
                              </div>
                            </>
                          )
                          : (
                            <div className="empty-state">
                              <FileText size={26} />
                              <h4>Let's agree on the work</h4>
                              <p>
                                Review the proposed terms below before work
                                starts.
                              </p>
                            </div>
                          )}
                        {p.agreements
                          .filter((x) => x.status === "proposed")
                          .map((proposed) => (
                            <div className="pending-card" key={proposed.id}>
                              <span className="eyebrow">
                                PROPOSED {a ? "UPDATED TERMS" : "AGREEMENT"}
                              </span>
                              <h4>
                                {money(proposed.amountMinor)} · due{" "}
                                {proposed.deadline}
                              </h4>
                              <p>{proposed.brief}</p>
                              <ul>
                                {proposed.deliverables.map((d, i) => (
                                  <li key={i}>{d}</li>
                                ))}
                              </ul>
                              <p>
                                {proposed.revisionRounds}{" "}
                                rounds · payment within {proposed.paymentDays}
                                {" "}
                                days of acceptance
                              </p>
                              {!employer
                                ? (
                                  <div className="button-row">
                                    <button
                                      disabled={busy}
                                      className="button primary"
                                      onClick={() =>
                                        void onCommand({
                                          type: "decideAgreement",
                                          projectId: p.id,
                                          agreementId: proposed.id,
                                          accept: true,
                                        })}
                                    >
                                      Accept agreement
                                    </button>
                                    <button
                                      disabled={busy}
                                      className="button secondary"
                                      onClick={() =>
                                        void onCommand({
                                          type: "decideAgreement",
                                          projectId: p.id,
                                          agreementId: proposed.id,
                                          accept: false,
                                        })}
                                    >
                                      Decline
                                    </button>
                                  </div>
                                )
                                : (
                                  <p className="muted">
                                    Awaiting {person.name}'s acceptance.
                                  </p>
                                )}
                            </div>
                          ))}
                        <AgreementHistory
                          agreements={p.agreements}
                          activeId={p.activeAgreementId}
                        />
                        <div className="tip-card">
                          <span>✦</span>
                          <p>
                            A clear agreement leaves more room for creativity.
                            <small>
                              Scope and payment decisions always stay with
                              people.
                            </small>
                          </p>
                        </div>
                      </>
                    )}
                    {tab === "deliverables" && (
                      <Deliverables
                        snapshot={snapshot}
                        project={p}
                        agreement={a}
                        employer={employer}
                        busy={busy}
                        onCommand={onCommand}
                        onRevision={() => setTab("revisions")}
                      />
                    )}
                    {tab === "revisions" && (
                      <Revisions
                        project={p}
                        employer={employer}
                        busy={busy}
                        onCommand={onCommand}
                        onNotify={onNotify}
                      />
                    )}
                    {tab === "payments" && (
                      <>
                        <div className="section-heading">
                          <h3>Payments, in perspective</h3>
                          <Wallet size={17} />
                        </div>
                        <p className="muted">
                          {mode === "demo"
                            ? "All payment interactions in this demo are simulated. No money moves."
                            : p.origin === "sample"
                            ? "Historical sample records. These are not PayPal transactions."
                            : "Actual sandbox invoices and test payments. No live funds."}
                        </p>
                        <div className="payment-summary">
                          <span>
                            Agreed total
                            <strong>
                              {a ? money(a.amountMinor) : "Not accepted"}
                            </strong>
                          </span>
                          <span>
                            Invoiced
                            <strong>
                              {money(
                                p.invoices
                                  .filter((i) => i.state !== "cancelled")
                                  .reduce(
                                    (sum, i) => sum + BigInt(i.amountMinor),
                                    0n,
                                  )
                                  .toString(),
                              )}
                            </strong>
                          </span>
                          <span>
                            Settled
                            <strong>
                              {money(
                                p.invoices
                                  .reduce(
                                    (sum, i) => sum + BigInt(i.paidMinor),
                                    0n,
                                  )
                                  .toString(),
                              )}
                            </strong>
                          </span>
                        </div>
                        {!p.invoices.length && (
                          <div className="empty-state">
                            <Wallet size={28} />
                            <h4>No invoice yet</h4>
                            <p>
                              {p.state === "accepted"
                                ? "The worker can issue an invoice for approved work."
                                : "Review and accept the delivery before invoicing."}
                            </p>
                          </div>
                        )}
                        {p.invoices.map((i) => (
                          <div
                            className={`invoice-card ${
                              invoiceAttention(i, today)
                                ? "needs-attention"
                                : ""
                            }`}
                            key={i.id}
                          >
                            <div>
                              <span className="eyebrow">{i.number}</span>
                              <span className={`pill payment-${i.state}`}>
                                {i.state === "paid" && (
                                  <CheckCircle2 size={12} />
                                )}
                                {i.state}
                              </span>
                            </div>
                            <strong>{money(i.amountMinor)}</strong>
                            <p>
                              {money(i.paidMinor)} settled · {money(
                                (
                                  BigInt(i.amountMinor) - BigInt(i.paidMinor)
                                ).toString(),
                              )} remaining
                            </p>
                            <small>
                              Due {i.dueDate} · {i.source === "sample"
                                ? "Sample data"
                                : "PayPal Sandbox"}
                            </small>
                            {i.pendingMinor !== "0" && (
                              <p className="pending-text">
                                {money(i.pendingMinor)} processing — not settled
                              </p>
                            )}
                            {i.error && (
                              <p className="error-message">{i.error}</p>
                            )}
                            {i.providerId && <code>{i.providerId}</code>}
                            {i.recipientUrl && (
                              <a
                                className="button secondary"
                                href={i.recipientUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Open PayPal invoice
                                <ExternalLink size={13} />
                              </a>
                            )}
                            {mode === "demo" && (
                              <div className="simulation-controls">
                                <span>SIMULATE PAYMENT</span>
                                {(
                                  [
                                    "pending",
                                    "partial",
                                    "paid",
                                    "failed",
                                  ] as const
                                ).map((state) => (
                                  <button
                                    disabled={busy}
                                    key={state}
                                    onClick={() =>
                                      void onCommand({
                                        type: "simulatePayment",
                                        projectId: p.id,
                                        invoiceId: i.id,
                                        state,
                                      })}
                                  >
                                    {state}
                                  </button>
                                ))}
                              </div>
                            )}
                            <small className="sync-time">
                              Synced {new Date(i.syncedAt).toLocaleString()}
                            </small>
                          </div>
                        ))}
                        <div className="button-row">
                          {!employer &&
                            p.state === "accepted" &&
                            (BigInt(a?.amountMinor ?? "0") >
                                p.invoices
                                  .filter((i) => i.state !== "cancelled")
                                  .reduce(
                                    (sum, i) => sum + BigInt(i.amountMinor),
                                    0n,
                                  ) ||
                              (mode === "integrated" &&
                                p.invoices.some(
                                  (i) => i.state === "draft" || i.error,
                                ))) &&
                            (mode === "demo" ||
                              (p.origin === "sandbox" && person.connected)) &&
                            (
                              <button
                                className="button primary"
                                disabled={busy}
                                onClick={() => void onIssue(p.id)}
                              >
                                <Plus size={15} />
                                {mode === "demo"
                                  ? "Create simulated invoice"
                                  : "Create & send sandbox invoice"}
                              </button>
                            )}
                          {mode === "integrated" && p.origin === "sandbox" && (
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={() => void onRefresh(p.id)}
                            >
                              Refresh PayPal status
                            </button>
                          )}
                        </div>
                        {mode === "integrated" && !person.connected && (
                          <div className="info-note">
                            This worker has no connected sandbox seller.
                            Invoicing requires the configured Sandbox seller.
                          </div>
                        )}
                        <div className="info-note">
                          <ShieldCheck size={16} />
                          Completion and payment are independent. Payment status
                          comes from verified provider state.
                        </div>
                      </>
                    )}
                    {tab === "activity" && (
                      <>
                        <h3>A shared record</h3>
                        <div className="activity-list">
                          {[...p.activity].reverse().map((event) => (
                            <div key={event.id}>
                              <span className="activity-marker" />
                              <div>
                                <p>{event.text}</p>
                                <small>
                                  {snapshot.people.find(
                                    (person) =>
                                      person.id === event.actorId,
                                  )?.name ?? "Project participant"} ·{" "}
                                  {new Date(event.createdAt).toLocaleString()}
                                </small>
                              </div>
                            </div>
                          ))}
                        </div>
                        <CommentBox
                          projectId={p.id}
                          onCommand={onCommand}
                          busy={busy}
                        />
                      </>
                    )}
                  </div>
                  <div className="drawer-bottom">
                    <span>
                      <ShieldCheck size={13} />
                      Built on clear agreements
                    </span>
                    <span>Northstar Creative</span>
                  </div>
                </>
              )
              : (
                <div className="empty-state">
                  <FileText size={28} />
                  <h3>No matching projects</h3>
                  <p>This person has no projects matching this filter.</p>
                </div>
              )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {editTerms && p && (
        <ProjectForm
          people={snapshot.people}
          workerId={person.id}
          projectId={p.id}
          current={a}
          onClose={() => setEditTerms(false)}
          onSubmit={onCommand}
        />
      )}
    </>
  );
}
function Deliverables({
  snapshot,
  project: p,
  agreement,
  employer,
  busy,
  onCommand,
  onRevision,
}: {
  snapshot: WorkspaceSnapshot;
  project: Project;
  agreement?: Agreement;
  employer: boolean;
  busy: boolean;
  onCommand: (c: Command) => Promise<boolean>;
  onRevision: () => void;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [source, setSource] = useState<"link" | "file">("file");
  const [fileId, setFileId] = useState("");
  const attached = (snapshot.files ?? []).filter((f) => f.projectId === p.id);
  return (
    <>
      <div className="section-heading">
        <h3>From brief to finished</h3>
        <span className="muted">{p.deliveries.length} versions</span>
      </div>
      {[...p.deliveries].reverse().map((d, index) => (
        <div className="delivery-card" key={d.id}>
          <div className="delivery-icon">
            <FileText size={22} />
          </div>
          <div className="delivery-info">
            <strong>{d.label}</strong>
            <small>
              Agreement v
              {p.agreements.findIndex((a) =>
                a.id === d.agreementId
              ) + 1} · {new Date(d.submittedAt).toLocaleDateString()}
            </small>
            <p>{d.note || "Submitted for review."}</p>
            {d.fileId
              ? (
                <button
                  className="button secondary"
                  onClick={() =>
                    void openFile(d.fileId!, d.fileVersion).catch((e) =>
                      setError(e.message)
                    )}
                >
                  Open submitted file · v{(d.fileVersion ?? 0) + 1}
                  <ExternalLink size={12} />
                </button>
              )
              : (
                <a href={d.url} target="_blank" rel="noopener noreferrer">
                  Open Google Drive link
                  <ExternalLink size={12} />
                </a>
              )}
            <span
              className={`pill work-${
                d.status === "accepted"
                  ? "accepted"
                  : d.status === "submitted"
                  ? "submitted"
                  : "changes_requested"
              }`}
            >
              {d.status.replaceAll("_", " ")}
            </span>
            {employer && index === 0 && p.state === "submitted" && (
              <div className="button-row">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void onCommand({
                      type: "acceptDelivery",
                      projectId: p.id,
                      deliveryId: d.id,
                    })}
                >
                  <Check size={14} />
                  Accept delivery
                </button>
                <button className="button secondary" onClick={onRevision}>
                  Request changes
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      {!p.deliveries.length && (
        <div className="empty-state">
          <Link size={28} />
          <h4>The next great thing is on its way</h4>
          <p>
            Submitted files, Drive links and version history will appear here.
          </p>
        </div>
      )}
      <h4>Project files & revision references</h4>
      <FilePicker
        snapshot={snapshot}
        projectId={p.id}
        onUploaded={(f) => setFileId(f.id)}
      />
      <div className="project-file-list">
        {attached.map((f) => (
          <div key={f.id}>
            <FileText size={15} />
            <button
              onClick={() =>
                void openFile(f.id).catch((e) => setError(e.message))}
            >
              {f.name} · v{f.versions.length}
            </button>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="error-message">{error}</p>}
      {!employer && agreement && (
        <form
          className="stacked-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = driveUrlSchema.safeParse(url);
            const file = attached.find((f) => f.id === fileId);
            if (source === "file" && !file) {
              setError("Choose an uploaded project file.");
              return;
            }
            if (source === "link" && !parsed.success) {
              setError(parsed.error.issues[0].message);
              return;
            }
            setError("");
            if (
              await onCommand(
                source === "file"
                  ? {
                    type: "submitFileDelivery",
                    projectId: p.id,
                    fileId: file!.id,
                    fileVersion: file!.versions.length - 1,
                    label,
                    note,
                  }
                  : {
                    type: "submitDelivery",
                    projectId: p.id,
                    url,
                    label,
                    note,
                  },
              )
            ) {
              setUrl("");
              setLabel("");
              setNote("");
            }
          }}
        >
          <h4>Share your next version</h4>
          <label>
            Submission source<select
              value={source}
              onChange={(e) => setSource(e.target.value as "link" | "file")}
            >
              <option value="file">Uploaded file</option>
              <option value="link">Google Drive / Docs link</option>
            </select>
          </label>
          {source === "file"
            ? (
              <label>
                Project file<select
                  value={fileId}
                  onChange={(e) => setFileId(e.target.value)}
                  required
                >
                  <option value="">Choose a stored file…</option>
                  {attached.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · v{f.versions.length}
                    </option>
                  ))}
                </select>
              </label>
            )
            : (
              <>
                <label>
                  Google Drive or Docs link
                  <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://drive.google.com/file/d/…"
                  />
                </label>
              </>
            )}
          <label>
            Version label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              maxLength={80}
              placeholder="v2 · spelling correction & new ending"
            />
          </label>
          <label>
            Note <small>Optional</small>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={3000}
              placeholder="Here's what changed…"
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            <Send size={15} />
            Submit for review
          </button>
          <p className="fine-print">
            Uploaded submissions retain the exact file version for review.
            Shared Drive links require access for your employer.
          </p>
        </form>
      )}
    </>
  );
}
function Revisions({
  project: p,
  employer,
  busy,
  onCommand,
  onNotify,
}: {
  project: Project;
  employer: boolean;
  busy: boolean;
  onCommand: (c: Command) => Promise<boolean>;
  onNotify: (s: string) => void;
}) {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<ScopeAnalysis | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [clarifyItem, setClarifyItem] = useState<
    {
      revisionId: string;
      itemId: string;
    } | null
  >(null);
  const [clarification, setClarification] = useState("");
  const [proposalItem, setProposalItem] = useState<
    {
      revisionId: string;
      itemId: string;
      description: string;
    } | null
  >(null);
  const [amount, setAmount] = useState("30.00");
  const [deadline, setDeadline] = useState(activeAgreement(p)?.deadline ?? "");
  useEffect(() => {
    setText("");
    setAnalysis(null);
    setProposalItem(null);
  }, [p.id]);
  return (
    <>
      <div className="section-heading">
        <h3>Keep the scope in focus</h3>
        <MessageSquare size={17} />
      </div>
      <p className="muted">
        AI offers perspective. People decide what's included and what changes.
      </p>
      {employer && p.state === "submitted" && (
        <div className="revision-composer">
          <label>
            Your feedback
            <textarea
              rows={3}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setAnalysis(null);
              }}
              placeholder="Fix the spelling at 0:14 and add a second ending."
              maxLength={10000}
            />
          </label>
          <div className="button-row">
            <button
              className="button ai-button"
              disabled={aiBusy || text.trim().length < 3}
              onClick={async () => {
                setAiBusy(true);
                try {
                  setAnalysis(await scopeAssistant.compare(p.id, text));
                } catch (e) {
                  onNotify((e as Error).message);
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              <Sparkles size={15} />
              {aiBusy ? "Comparing scope…" : "Compare with agreed scope"}
            </button>
            <button
              className="text-button"
              disabled={text.trim().length < 3}
              onClick={() =>
                setAnalysis({
                  mode: mode === "demo" ? "demo" : "live",
                  items: [
                    {
                      text,
                      classification: "unclear",
                      explanation:
                        "Manually submitted for discussion; no AI classification.",
                      uncertainty: "high",
                      sources: [],
                    },
                  ],
                  questions: [],
                })}
            >
              Review manually
            </button>
          </div>
          {analysis && (
            <div className="analysis-preview">
              <span className="eyebrow">
                {analysis.mode === "demo"
                  ? "DETERMINISTIC DEMO · ADVISORY"
                  : "AI COMPARISON · ADVISORY"}
              </span>
              {analysis.items.map((item, index) => (
                <div
                  className={`scope-item ${item.classification}`}
                  key={index}
                >
                  <span className="classification">
                    {item.classification.replaceAll("_", " ")}
                  </span>
                  <strong>{item.text}</strong>
                  <p>{item.explanation}</p>
                  {item.sources.map((s, index) => (
                    <blockquote key={index}>
                      “{s.quote}”<cite>Agreement · {s.clauseId}</cite>
                    </blockquote>
                  ))}
                  {!item.sources.length && (
                    <small>No matching agreement clause found.</small>
                  )}
                  <small>Uncertainty: {item.uncertainty}</small>
                </div>
              ))}
              {analysis.questions.map((q, i) => <p key={i}>{q}</p>)}
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  if (
                    await onCommand({
                      type: "requestRevision",
                      projectId: p.id,
                      text,
                      items: analysis.items,
                    })
                  ) {
                    setText("");
                    setAnalysis(null);
                  }
                }}
              >
                Send revision request
                <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
      {[...p.revisions].reverse().map((r) => (
        <div className="revision-record" key={r.id}>
          <div className="section-heading">
            <h4>Revision request</h4>
            <small>{r.roundConsumed ? "1 round used" : "No round used"}</small>
          </div>
          {r.items.map((item) => (
            <div className={`scope-item ${item.classification}`} key={item.id}>
              <span className="classification">
                {item.classification.replaceAll("_", " ")}
              </span>
              <strong>{item.text}</strong>
              <p>{item.explanation}</p>
              {item.sources.map((s, i) => (
                <blockquote key={i}>
                  “{s.quote}”<cite>Accepted agreement · {s.clauseId}</cite>
                </blockquote>
              ))}
              <div className="item-disposition">
                <span>{item.disposition.replaceAll("_", " ")}</span>
                <small>Uncertainty: {item.uncertainty}</small>
              </div>
              {item.note && <p>{item.note}</p>}
              {!employer &&
                ["awaiting_response", "clarification"].includes(
                  item.disposition,
                ) && (
                <div className="revision-actions">
                  <button
                    disabled={busy}
                    className="button secondary"
                    onClick={() =>
                      void onCommand({
                        type: "respondRevision",
                        projectId: p.id,
                        revisionId: r.id,
                        itemId: item.id,
                        disposition: "included",
                        note: "",
                        waiveRound: false,
                      })}
                  >
                    Accept as included
                  </button>
                  <button
                    disabled={busy}
                    className="text-button"
                    onClick={() =>
                      void onCommand({
                        type: "respondRevision",
                        projectId: p.id,
                        revisionId: r.id,
                        itemId: item.id,
                        disposition: "included",
                        note: "Included round waived by worker.",
                        waiveRound: true,
                      })}
                  >
                    Include & waive round
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setClarifyItem({ revisionId: r.id, itemId: item.id });
                      setClarification("");
                    }}
                  >
                    Ask for clarification
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      setProposalItem({
                        revisionId: r.id,
                        itemId: item.id,
                        description: item.text,
                      })}
                  >
                    Propose additional work →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      {clarifyItem && (
        <form
          className="pending-card stacked-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await onCommand({
                type: "respondRevision",
                projectId: p.id,
                revisionId: clarifyItem.revisionId,
                itemId: clarifyItem.itemId,
                disposition: "clarification",
                note: clarification,
                waiveRound: false,
              })
            ) {
              setClarifyItem(null);
              setClarification("");
            }
          }}
        >
          <label>
            What needs clarification?
            <textarea
              autoFocus
              value={clarification}
              onChange={(e) => setClarification(e.target.value)}
              required
              minLength={3}
              maxLength={2000}
            />
          </label>
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              Ask for clarification
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setClarifyItem(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {proposalItem && (
        <form
          className="pending-card stacked-form"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const ok = await onCommand({
                type: "proposeAddition",
                projectId: p.id,
                revisionId: proposalItem.revisionId,
                itemId: proposalItem.itemId,
                description: proposalItem.description,
                amountMinor: parseAmount(amount),
                deadline: deadline || null,
              });
              if (ok) setProposalItem(null);
            } catch (e) {
              onNotify((e as Error).message);
            }
          }}
        >
          <h4>Propose additional work</h4>
          <label>
            What will you add?
            <textarea
              rows={2}
              value={proposalItem.description}
              onChange={(e) =>
                setProposalItem({
                  ...proposalItem,
                  description: e.target.value,
                })}
              required
            />
          </label>
          <div className="field-grid">
            <label>
              Additional price · USD
              <input
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              New deadline
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => setAmount("0.00")}
          >
            Waive the charge ($0)
          </button>
          <div className="button-row">
            <button className="button primary" disabled={busy}>
              Send proposal
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setProposalItem(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {p.proposals.map((proposal) => (
        <div className="pending-card" key={proposal.id}>
          <div className="section-heading">
            <span className="eyebrow">ADDITIONAL WORK</span>
            <span className="pill">{proposal.status}</span>
          </div>
          <h4>{proposal.description}</h4>
          <strong className="proposal-price">
            + {money(proposal.amountMinor)}
            {proposal.amountMinor === "0" && <small>· charge waived</small>}
          </strong>
          {proposal.deadline && <p>Proposed deadline: {proposal.deadline}</p>}
          <p>
            {proposal.status === "pending"
              ? "The agreed total stays unchanged until approval."
              : `Decision recorded ${
                new Date(proposal.decidedAt!).toLocaleDateString()
              }.`}
          </p>
          {!employer &&
            proposal.status === "pending" &&
            proposal.baseAgreementId !== p.activeAgreementId && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void onCommand({
                  type: "rebaseProposal",
                  projectId: p.id,
                  proposalId: proposal.id,
                })}
            >
              Rebase on current terms
            </button>
          )}
          {employer && proposal.status === "pending" && (
            <div className="button-row">
              <button
                disabled={busy}
                className="button primary"
                onClick={() =>
                  void onCommand({
                    type: "decideProposal",
                    projectId: p.id,
                    proposalId: proposal.id,
                    accept: true,
                  })}
              >
                Accept proposal
              </button>
              <button
                disabled={busy}
                className="button secondary"
                onClick={() =>
                  void onCommand({
                    type: "decideProposal",
                    projectId: p.id,
                    proposalId: proposal.id,
                    accept: false,
                  })}
              >
                Decline
              </button>
            </div>
          )}
        </div>
      ))}
      {!p.revisions.length && p.state !== "submitted" && (
        <div className="empty-state">
          <MessageSquare size={28} />
          <h4>Room for a little back-and-forth</h4>
          <p>Revision requests and agreed additions will appear here.</p>
        </div>
      )}
      <CommentBox projectId={p.id} onCommand={onCommand} busy={busy} />
    </>
  );
}
function CommentBox({
  projectId,
  onCommand,
  busy,
}: {
  projectId: string;
  onCommand: (c: Command) => Promise<boolean>;
  busy: boolean;
}) {
  const [comment, setComment] = useState("");
  return (
    <form
      className="comment-box"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onCommand({ type: "discuss", projectId, text: comment })) {
          setComment("");
        }
      }}
    >
      <label className="sr-only" htmlFor="comment">
        Discuss this project
      </label>
      <input
        id="comment"
        placeholder="Leave a note for the project…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={3000}
        required
      />
      <button
        className="icon-button"
        aria-label="Send comment"
        disabled={busy || !comment.trim()}
      >
        <Send size={17} />
      </button>
    </form>
  );
}
