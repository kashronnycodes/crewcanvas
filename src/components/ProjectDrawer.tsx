import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft,ArrowRight,CalendarDays,Check,CheckCircle2,ChevronDown,Clock3,ExternalLink,FileText,History,Link,MessageSquare,Plus,Send,ShieldCheck,Sparkles,Wallet,X } from "lucide-react";
import { useEffect,useRef,useState } from "react";
import { activeAgreement,invoiceAttention,money,parseAmount,todayIn,} from "../../shared/domain";
import { payableInvoice } from "../../shared/studio";
import type { Agreement,Person,Project,ScopeAnalysis,WorkspaceSnapshot,} from "../../shared/types";
import { type Command,deliverableUrlSchema } from "../../shared/validation";
import { openFile } from "../fileService";
import { scopeAssistant } from "../services";
import AgreementHistory from "./AgreementHistory";
import DeliverablePreview from "./DeliverablePreview";
import PaymentOverview from "./PaymentOverview";
import ProjectForm from "./ProjectForm";
import TaskAssignment from "./TaskAssignment";
import MemberFiles from "./MemberFiles";
import RevisionNotes from "./RevisionNotes";
import {ReferenceImagePicker,RevisionReferenceGallery,useReferenceImages} from "./RevisionReferences";
type Filter = "all" | "attention" | "completed";
export default function ProjectDrawer({ person, snapshot, initialFilter, initialProjectId, initialTab = "overview", onClose, onBack, onAddTask, onCommand, onIssue, onRefresh, busy, onNotify, studio = false, }: {
    person?: Person;
    snapshot: WorkspaceSnapshot;
    initialFilter: Filter;
    initialProjectId?: string;
    initialTab?: import("../../shared/freelance-canvas").ProjectTab;
    onClose: () => void;
    onBack?: () => void;
    onAddTask?: () => void;
    onCommand: (c: Command) => Promise<boolean>;
    onIssue: (id: string) => Promise<boolean>;
    onRefresh: (id: string) => Promise<boolean>;
    busy: boolean;
    onNotify: (s: string) => void;
    studio?: boolean;
}) {
    const today = todayIn(snapshot.timezone);
    const allProjects = snapshot.projects.filter((p) => p.id === initialProjectId || p.workerId === (person?.id ?? null));
    const projects = allProjects.filter((p) => initialFilter === "all" ||
        (initialFilter === "completed"
            ? p.state === "accepted"
            : p.invoices.some((i) => invoiceAttention(i, today))));
    const [selectedId, setSelectedId] = useState(initialProjectId ?? projects[0]?.id ?? "");
    const scrollArea=useRef<HTMLDivElement>(null);
    const scrollToSection=(section:string)=>{const panel=scrollArea.current;const element=panel?.querySelector<HTMLElement>(`[data-task-section="${section}"]`);if(panel&&element)panel.scrollTop+=element.getBoundingClientRect().top-panel.getBoundingClientRect().top;};
    const [editTerms, setEditTerms] = useState(false);
    const [composeRevision, setComposeRevision] = useState(false);
    useEffect(() => setComposeRevision(false), [selectedId]);
    useEffect(() => {
        setSelectedId(initialProjectId ?? projects[0]?.id ?? "");
    }, [initialFilter, initialProjectId, initialTab]);
    const p = projects.find((p) => p.id === selectedId) ?? projects[0];
    const a = p && activeAgreement(p);
    useEffect(()=>{setEditTerms(false);setComposeRevision(false);if(scrollArea.current)scrollArea.current.scrollTop=0;if(initialFilter==="attention"||initialTab!=="overview")scrollToSection(initialFilter==="attention"?"payments":initialTab);},[p?.id,initialTab,initialFilter]);
    const employer = snapshot.people.find((p) => p.id === snapshot.actorId)?.accessRole ===
        "employer";
    return (<>
      <Dialog.Root open onOpenChange={(open) => !open && onClose()} modal={window.matchMedia("(max-width: 600px)").matches}>
        <Dialog.Portal>
          <Dialog.Content className={`worker-drawer ${studio ? "reference-drawer" : ""} ${composeRevision ? "is-composing-revision" : ""}`} onInteractOutside={(e) => {
            if ((e.target as HTMLElement).closest(".person-node, .group-node, .modal-content, .canvas-dialog, .react-flow, .topbar, .workspace-toolbar, .person-card")) {
                e.preventDefault();
            }
        }}>
            <div className="drawer-top">
              {composeRevision
            ? (<button className="text-button" onClick={() => setComposeRevision(false)}>
                    <ArrowLeft size={15}/> Back to delivery & revisions
                  </button>)
            : (<button className="text-button" onClick={onBack ?? onClose}>
                    ← Back
                  </button>)}
              <Dialog.Close className="icon-button" aria-label="Close worker details">
                <X size={20}/>
              </Dialog.Close>
            </div>
            <div className="member-panel-header">
              <Dialog.Title>{person?.name ?? "Unassigned"}</Dialog.Title>
              <Dialog.Description className="sr-only">Member files, task details, revisions and payment history.</Dialog.Description>
              {onAddTask && employer && <button className="button secondary" onClick={onAddTask}>Add task</button>}
            </div>
            {projects.length > 1 && (
            <div className="project-selector">
              <label htmlFor="project-select">
                {studio || onBack ? "TASK" : "PROJECT"}{" "}
                <span>
                  {projects.length}{" "}
                  {initialFilter !== "all" ? "matching" : "assigned"}
                </span>
              </label>
              <div>
                <select id="project-select" disabled={busy || composeRevision} value={p?.id ?? ""} onChange={(e) => setSelectedId(e.target.value)}>
                  {projects.map((p) => (<option key={p.id} value={p.id}>
                      {p.title}
                    </option>))}
                </select>
                <ChevronDown size={16}/>
              </div>
            </div>
            )}
            {p
            ? (<>
                  <div className="drawer-body task-page" ref={scrollArea} id="project-tab-panel">
                    <section aria-label="Task details" data-task-section="overview" className="task-page-section">
                      <h3>Task details</h3><p className="task-page-title">{p.title}</p>
                      {employer && <TaskAssignment key={p.id} task={p} people={snapshot.people} onCommand={onCommand} busy={busy} />}
                    {(<>
                        <div className="section-heading">
                          <h3>The agreement</h3>
                          {employer && (<button className="text-button" onClick={() => setEditTerms(true)}>
                              Propose changes
                            </button>)}
                        </div>
                        {a
                        ? (<>
                              <div className="agreement-status">
                                <ShieldCheck size={16}/>
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
                                    {new Date(`${a.deadline}T12:00:00`).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                            })}
                                    <CalendarDays size={16}/>
                                  </strong>
                                </div>
                              </div>
                              <div className="brief-block">
                                <h4>The brief</h4>
                                <p>{a.brief}</p>
                              </div>
                              <h4>What we're making</h4>
                              <ul className="deliverable-checklist">
                                {a.deliverables.map((d, i) => (<li key={i}>
                                    <span className="check-outline">
                                      <Check size={11}/>
                                    </span>
                                    {d}
                                  </li>))}
                              </ul>
                              <div className="agreement-meta">
                                <span>
                                  <MessageSquare size={15}/>
                                  {p.revisions.filter((r) => r.roundConsumed)
                                .length} / {a.revisionRounds}{" "}
                                  revision rounds used
                                </span>
                                <span>
                                  <Clock3 size={15}/>
                                  Payment due {a.paymentDays}{" "}
                                  days after acceptance
                                </span>
                              </div>
                            </>)
                        : (<div className="empty-state">
                              <FileText size={26}/>
                              <h4>Let's agree on the work</h4>
                              <p>
                                Review the proposed terms below before work
                                starts.
                              </p>
                            </div>)}
                        {p.agreements
                        .filter((x) => x.status === "proposed")
                        .map((proposed) => (<div className="pending-card" key={proposed.id}>
                              <span className="eyebrow">
                                PROPOSED {a ? "UPDATED TERMS" : "AGREEMENT"}
                              </span>
                              <h4>
                                {money(proposed.amountMinor)} · due{" "}
                                {proposed.deadline}
                              </h4>
                              <p>{proposed.brief}</p>
                              <ul>
                                {proposed.deliverables.map((d, i) => (<li key={i}>{d}</li>))}
                              </ul>
                              <p>
                                {proposed.revisionRounds}{" "}
                                rounds · payment within {proposed.paymentDays}
                                {" "}
                                days of acceptance
                              </p>
                              {!employer
                            ? (<div className="button-row">
                                    <button disabled={busy} className="button primary" onClick={() => void onCommand({
                                    type: "decideAgreement",
                                    projectId: p.id,
                                    agreementId: proposed.id,
                                    accept: true,
                                })}>
                                      Accept agreement
                                    </button>
                                    <button disabled={busy} className="button secondary" onClick={() => void onCommand({
                                    type: "decideAgreement",
                                    projectId: p.id,
                                    agreementId: proposed.id,
                                    accept: false,
                                })}>
                                      Decline
                                    </button>
                                  </div>)
                            : (<p className="muted">
                                    {!p.workerId ? 'Planning task · assign someone when ready.' : person?.sample ? 'Sample member · planning only. No account access.' : `Awaiting ${person?.name ?? 'the assignee'}’s acceptance.`}
                                  </p>)}
                            </div>))}
                        <AgreementHistory agreements={p.agreements} activeId={p.activeAgreementId}/>
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
                      </>)}
                    </section>
                    <section aria-label="Files and previews" data-task-section="deliverables" className="task-page-section">
                      <h3>Files and previews</h3>
                      <Deliverables key={p.id} snapshot={snapshot} project={p} agreement={a} employer={employer} busy={busy} onCommand={onCommand} onRevision={() => {setComposeRevision(true);scrollToSection("revisions");}} />
                    </section>
                    <section aria-label="Revisions" data-task-section="revisions" className="task-page-section">
                      <h3>Revisions</h3>
                      <RevisionNotes project={p} employer={employer} busy={busy} showHistory={false} onApprove={deliveryId=>void onCommand({type:"acceptDelivery",projectId:p.id,deliveryId})} onRequest={()=>{setComposeRevision(true);scrollToSection("revisions");}} />
                      {!p.deliveries.length && <p className="fine-print">Revision notes appear after the freelancer submits work.</p>}
                      <Revisions key={p.id} snapshot={snapshot} composing={composeRevision} onCompose={setComposeRevision} project={p} employer={employer} busy={busy} onCommand={onCommand} onNotify={onNotify}/>
                    </section>
                    <section aria-label="Payments" data-task-section="payments" className="task-page-section">
                      <h3>Payments</h3>
                    {(<>
                        <PaymentOverview project={p} person={person} employer={employer} busy={busy} onIssue={onIssue}/>
                        <div className="section-heading">
                          <h3>Payments, in perspective</h3>
                          <Wallet size={17}/>
                        </div>
                        <p className="muted">
                          {p.origin === "sample"
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
                              {money(p.invoices
                        .filter((i) => i.state !== "cancelled")
                        .reduce((sum, i) => sum + BigInt(i.amountMinor), 0n)
                        .toString())}
                            </strong>
                          </span>
                          <span>
                            Settled
                            <strong>
                              {money(p.invoices
                        .reduce((sum, i) => sum + BigInt(i.paidMinor), 0n)
                        .toString())}
                            </strong>
                          </span>
                        </div>
                        {!p.invoices.length && (<p className="task-empty">No invoices yet.</p>)}
                        {p.invoices.map((i) => (<div className={`invoice-card ${invoiceAttention(i, today)
                            ? "needs-attention"
                            : ""}`} key={i.id}>
                            <div>
                              <span className="eyebrow">{i.number}</span>
                              <span className={`pill payment-${i.state}`}>
                                {i.state === "paid" && (<CheckCircle2 size={12}/>)}
                                {i.state}
                              </span>
                            </div>
                            <strong>{money(i.amountMinor)}</strong>
                            <p>
                              {money(i.paidMinor)} settled · {money((BigInt(i.amountMinor) - BigInt(i.paidMinor)).toString())} remaining
                            </p>
                            <small>
                              Due {i.dueDate} · {i.source === "sample"
                            ? "Sample data"
                            : "PayPal Sandbox"}
                            </small>
                            {i.pendingMinor !== "0" && (<p className="pending-text">
                                {money(i.pendingMinor)} processing — not settled
                              </p>)}
                            {i.error && (<p className="error-message">{i.error}</p>)}
                            {i.providerId && <code>{i.providerId}</code>}
                            {payableInvoice(i) && employer && (<a className="button secondary" href={i.recipientUrl!} target="_blank" rel="noopener noreferrer">
                                Pay now · PayPal Sandbox
                                <ExternalLink size={13}/>
                              </a>)}

                            <small className="sync-time">
                              Synced {new Date(i.syncedAt).toLocaleString()}
                            </small>
                          </div>))}
                        <div className="button-row">
                          {!employer &&
                        p.state === "accepted" &&
                        (BigInt(a?.amountMinor ?? "0") >
                            p.invoices
                                .filter((i) => i.state !== "cancelled")
                                .reduce((sum, i) => sum + BigInt(i.amountMinor), 0n) ||
                            (p.invoices.some((i) => i.state === "draft" || i.error))) &&
                        ((p.origin === "sandbox" && person?.connected)) &&
                        (<button className="button primary" disabled={busy} onClick={() => void onIssue(p.id)}>
                                <Plus size={15}/>
                                {"Issue invoice · PayPal Sandbox"}
                              </button>)}
                          {p.origin === "sandbox" && (<button className="button secondary" disabled={busy} onClick={() => void onRefresh(p.id)}>
                              Refresh PayPal status
                            </button>)}
                        </div>
                        {!person?.connected && (<div className="info-note">
                            This worker has no connected sandbox seller.
                            Invoicing requires the configured Sandbox seller.
                          </div>)}
                        <div className="info-note">
                          <ShieldCheck size={16}/>
                          Completion and payment are independent. Payment status
                          comes from verified provider state.
                        </div>
                      </>)}
                    </section>
                    <section aria-label="Activity" data-task-section="activity" className="task-page-section">
                      <h3>Activity</h3>
                    {(<>
                        <h3>A shared record</h3>
                        <div className="activity-list">
                          {[...p.activity].reverse().map((event) => (<div key={event.id}>
                              <span className="activity-marker"/>
                              <div>
                                <p>{event.text}</p>
                                <small>
                                  {snapshot.people.find((person) => person.id === event.actorId)?.name ?? "Project participant"} ·{" "}
                                  {new Date(event.createdAt).toLocaleString()}
                                </small>
                              </div>
                            </div>))}
                        </div>
                        <CommentBox projectId={p.id} onCommand={onCommand} busy={busy}/>
                      </>)}
                    </section>
                  </div>
                </>)
            : (<div className="empty-state">
                  <FileText size={28}/>
                  <h3>No matching projects</h3>
                  <p>This person has no projects matching this filter.</p>
                </div>)}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {editTerms && p && (<ProjectForm people={snapshot.people} workerId={p.workerId} projectId={p.id} current={a ?? p.agreements.at(-1)} onClose={() => setEditTerms(false)} onSubmit={onCommand}/>)}
    </>);
}
function Deliverables({ snapshot, project: p, agreement, employer, busy, onCommand, onRevision, }: {
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
    const attached = (snapshot.files ?? []).filter((f) => f.projectId === p.id && f.purpose !== "revision_reference");
    return (<>
      <MemberFiles snapshot={snapshot} project={p} />
      <div className="section-heading">
        <h3>Submitted deliverables</h3>
        <span className="muted">{p.deliveries.length} versions</span>
      </div>
      {[...p.deliveries].reverse().map((d, index) => (<div className="delivery-card" key={d.id}>
          <DeliverablePreview snapshot={snapshot} project={p} delivery={d}/>
          <div className="delivery-icon">
            <FileText size={22}/>
          </div>
          <div className="delivery-info">
            <small>
              Agreement v
              {p.agreements.findIndex((a) => a.id === d.agreementId) + 1} · {new Date(d.submittedAt).toLocaleDateString()}
            </small>
            <p>{d.note || "Submitted for review."}</p>
            {d.fileId
                ? (<button className="button secondary" onClick={() => void openFile(d.fileId!, d.fileVersion).catch((e) => setError(e.message))}>
                  Open submitted file · v{(d.fileVersion ?? 0) + 1}
                  <ExternalLink size={12}/>
                </button>)
                : (<a href={d.url} target="_blank" rel="noopener noreferrer">
                  Open original link
                  <ExternalLink size={12}/>
                </a>)}
            <span className={`pill work-${d.status === "accepted"
                ? "accepted"
                : d.status === "submitted"
                    ? "submitted"
                    : "changes_requested"}`}>
              {d.status.replaceAll("_", " ")}
            </span>

          </div>
        </div>))}
      {!p.deliveries.length && (<p className="task-empty">No submitted work yet.</p>)}

      {error && <p role="alert" className="error-message">{error}</p>}
      {!employer && agreement && (<form className="stacked-form" onSubmit={async (e) => {
                e.preventDefault();
                const parsed = deliverableUrlSchema.safeParse(url);
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
                if (await onCommand(source === "file"
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
                    })) {
                    setUrl("");
                    setLabel("");
                    setNote("");
                }
            }}>
          <h4>Share your next version</h4>
          <label>
            Submission source<select value={source} onChange={(e) => setSource(e.target.value as "link" | "file")}>
              <option value="file">Uploaded file</option>
              <option value="link">Google Drive / Docs link</option>
            </select>
          </label>
          {source === "file"
                ? (<label>
                Project file<select value={fileId} onChange={(e) => setFileId(e.target.value)} required>
                  <option value="">Choose a stored file…</option>
                  {attached.map((f) => (<option key={f.id} value={f.id}>
                      {f.name} · v{f.versions.length}
                    </option>))}
                </select>
              </label>)
                : (<>
                <label>
                  Google Drive or Docs link (or another HTTPS deliverable)
                  <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…"/>
                </label>
              </>)}
          <label>
            Version label
            <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={80} placeholder="v2 · spelling correction & new ending"/>
          </label>
          <label>
            Note <small>Optional</small>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={3000} placeholder="Here's what changed…"/>
          </label>
          {error && (<p className="error-message" role="alert">
              {error}
            </p>)}
          <button className="button primary" disabled={busy}>
            <Send size={15}/>
            Submit for review
          </button>
          <p className="fine-print">
            Uploaded submissions retain the exact file version for review.
            Shared Drive links require access for your employer.
          </p>
        </form>)}
    </>);
}
function Revisions({ snapshot, project: p, employer, busy, onCommand, onNotify, composing, onCompose, }: {
    snapshot: WorkspaceSnapshot;
    project: Project;
    employer: boolean;
    busy: boolean;
    onCommand: (c: Command) => Promise<boolean>;
    onNotify: (s: string) => void;
    composing: boolean;
    onCompose: (value: boolean) => void;
}) {
    const [text, setText] = useState("");
    const references=useReferenceImages(p.id);
    const [sending, setSending] = useState(false);
    const [revisionError, setRevisionError] = useState("");
    const [analysis, setAnalysis] = useState<ScopeAnalysis | null>(null);
    const [aiBusy, setAiBusy] = useState(false);
    const [clarifyItem, setClarifyItem] = useState<{
        revisionId: string;
        itemId: string;
    } | null>(null);
    const [clarification, setClarification] = useState("");
    const [proposalItem, setProposalItem] = useState<{
        revisionId: string;
        itemId: string;
        description: string;
    } | null>(null);
    const [amount, setAmount] = useState("30.00");
    const [deadline, setDeadline] = useState(activeAgreement(p)?.deadline ?? "");
    const [dueDate, setDueDate] = useState("");
    const [revisionKind, setRevisionKind] = useState("included");
    const [requestedFee, setRequestedFee] = useState("25.00");
    const [counterId, setCounterId] = useState<string | null>(null);
    const [counterNote, setCounterNote] = useState("");
    const actorId = snapshot.actorId;
    useEffect(() => {
        if (composing)
            document.getElementById("revision-feedback")?.focus();
    }, [composing]);
    useEffect(() => {
        setText("");
        setAnalysis(null);
        setProposalItem(null);
    }, [p.id]);
    return (<>
      {composing && <h4>Request revision</h4>}
      {composing && (<button className="text-button revision-back" onClick={() => onCompose(false)}>
          <ArrowLeft size={15}/> Back to delivery & revisions
        </button>)}
      {composing && <p className="fine-print">AI offers perspective. People decide what is included and what changes.</p>}
      {composing && employer &&
            ["submitted", "changes_requested"].includes(p.state) && (<div className="revision-composer">
          <label>
            Your feedback
            <textarea id="revision-feedback" rows={3} value={text} onChange={(e) => {
                setText(e.target.value);
                setAnalysis(null);
            }} placeholder="Fix the spelling at 0:14 and add a second ending." maxLength={10000}/>
          </label>
          <p className="fine-print">
            Reviewing {p.deliveries.at(-1)?.label}
            {p.deliveries.at(-1)?.fileId
                ? ` · file v${(p.deliveries.at(-1)?.fileVersion ?? 0) + 1}`
                : " · external delivery"}. Each request is a separate history
            entry.
          </p>
          <ReferenceImagePicker images={references} disabled={busy||sending} />
          {revisionError && <p role="alert" className="error-message">{revisionError}</p>}
          <div className="field-grid">
            <label>
              Optional revision due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}/>
            </label>
            <label>
              Revision arrangement<select value={revisionKind} onChange={(e) => setRevisionKind(e.target.value)}>
                <option value="included">
                  Included / free · freelancer confirms
                </option>
                <option value="paid">Propose a paid revision</option>
              </select>
            </label>
          </div>
          {revisionKind === "paid" && (<label>
              Proposed fee · USD<input inputMode="decimal" value={requestedFee} onChange={(e) => setRequestedFee(e.target.value)} required pattern="[0-9]+(\.[0-9]{1,2})?"/>
            </label>)}
          <div className="button-row">
            <button className="button ai-button" disabled={aiBusy || text.trim().length < 3} onClick={async () => {
                setAiBusy(true);
                try {
                    setAnalysis(await scopeAssistant.compare(p.id, text));
                }
                catch (e) {
                    onNotify((e as Error).message);
                }
                finally {
                    setAiBusy(false);
                }
            }}>
              <Sparkles size={15}/>
              {aiBusy ? "Comparing scope…" : "Compare with agreed scope"}
            </button>
            <button className="text-button" disabled={text.trim().length < 3} onClick={() => setAnalysis({
                mode: "live",
                items: [
                    {
                        text,
                        classification: "unclear",
                        explanation: "Manually submitted for discussion; no AI classification.",
                        uncertainty: "high",
                        sources: [],
                    },
                ],
                questions: [],
            })}>
              Review manually
            </button>
          </div>
          {analysis && (<div className="analysis-preview">
              <span className="eyebrow">
                {"Scope review"}
              </span>
              {analysis.items.map((item, index) => (<div className={`scope-item ${item.classification}`} key={index}>
                  <span className="classification">
                    {item.classification.replaceAll("_", " ")}
                  </span>
                  <strong>{item.text}</strong>
                  <p>{item.explanation}</p>
                  {item.sources.map((s, index) => (<blockquote key={index}>
                      “{s.quote}”<cite>Agreement · {s.clauseId}</cite>
                    </blockquote>))}
                  {!item.sources.length && (<small>No matching agreement clause found.</small>)}
                  <small>Uncertainty: {item.uncertainty}</small>
                </div>))}
              {analysis.questions.map((q, i) => <p key={i}>{q}</p>)}
              <button className="button primary" disabled={busy || sending ||
                    (revisionKind === "paid" &&
                        !/^\d{1,6}(\.\d{1,2})?$/.test(requestedFee.trim()))} onClick={async () => {
                    if (sending) return;
                    setSending(true);setRevisionError("");
                    try {
                    const images=await references.upload();
                    if (await onCommand({
                        type: "requestRevision",
                        references:images,
                        projectId: p.id,
                        text,
                        items: analysis.items,
                        deliveryId: p.deliveries.at(-1)?.id,
                        dueDate: dueDate || null,
                        requestedFeeMinor: revisionKind === "paid"
                            ? parseAmount(requestedFee)
                            : null,
                    })) {
                        setText("");
                        setAnalysis(null);
                        setDueDate("");
                        references.clear();
                        onCompose(false);
                    } else {setRevisionError("The revision was not saved. Your notes are ready to retry.");}
                    } catch (err) { setRevisionError((err as Error).message); }
                    finally { setSending(false); }
                }}>
                {sending ? "Saving revision…" : "Send revision request"}
                <ArrowRight size={14}/>
              </button>
            </div>)}
        </div>)}
      <section className="revision-history">
        {[...p.revisions].reverse().map((r) => (<div className="revision-record" key={r.id}>
            {!!r.references?.length && <RevisionReferenceGallery snapshot={snapshot} project={p} revision={r} />}
            <div className="section-heading">
              <h4>Revision request</h4>
              <small>
                {r.roundConsumed ? "1 round used" : "No round used"}
              </small>
            </div>
            <p className="fine-print">
              Requested by {snapshot.people.find((person) => person.id === r.requestedBy)?.name ?? "Client"} · {new Date(r.createdAt).toLocaleString()} ·
              {" "}
              {p.deliveries.find((d) => d.id === r.deliveryId)?.label ??
                "Original submitted delivery"}
              {r.dueDate ? ` · Due ${r.dueDate}` : ""}
            </p>
            {p.proposals.filter((proposal) => proposal.revisionId === r.id).map((proposal) => (<p className="revision-fee-outcome" key={proposal.id}>
                  {money(proposal.amountMinor)} USD ·{" "}
                  {proposal.status.replaceAll("_", " ")}
                  {proposal.status === "pending"
                    ? ` · Awaiting ${proposal.authorId === p.workerId ? "client" : "freelancer"}`
                    : ""}
                </p>))}
            {r.items.map((item) => (<div className={`scope-item ${item.classification}`} key={item.id}>
                <span className="classification">
                  {item.classification.replaceAll("_", " ")}
                </span>
                <strong>{item.text}</strong>
                <p>{item.explanation}</p>
                {item.sources.map((s, i) => (<blockquote key={i}>
                    “{s.quote}”<cite>Accepted agreement · {s.clauseId}</cite>
                  </blockquote>))}
                <div className="item-disposition">
                  <span>{item.disposition.replaceAll("_", " ")}</span>
                  <small>Uncertainty: {item.uncertainty}</small>
                </div>
                {item.note && <p>{item.note}</p>}
                {!employer &&
                    ["awaiting_response", "clarification"].includes(item.disposition) && (<div className="revision-actions">
                    <button disabled={busy} className="button secondary" onClick={() => void onCommand({
                        type: "respondRevision",
                        projectId: p.id,
                        revisionId: r.id,
                        itemId: item.id,
                        disposition: "included",
                        note: "",
                        waiveRound: false,
                    })}>
                      Accept as included
                    </button>
                    <button disabled={busy} className="text-button" onClick={() => void onCommand({
                        type: "respondRevision",
                        projectId: p.id,
                        revisionId: r.id,
                        itemId: item.id,
                        disposition: "included",
                        note: "Included round waived by worker.",
                        waiveRound: true,
                    })}>
                      Include & waive round
                    </button>
                    <button className="text-button" onClick={() => {
                        setClarifyItem({ revisionId: r.id, itemId: item.id });
                        setClarification("");
                    }}>
                      Ask for clarification
                    </button>
                    <button className="text-button" onClick={() => setProposalItem({
                        revisionId: r.id,
                        itemId: item.id,
                        description: item.text,
                    })}>
                      Propose revision fee →
                    </button>
                  </div>)}
              </div>))}
          </div>))}
        {clarifyItem && (<form className="pending-card stacked-form" onSubmit={async (e) => {
                e.preventDefault();
                if (await onCommand({
                    type: "respondRevision",
                    projectId: p.id,
                    revisionId: clarifyItem.revisionId,
                    itemId: clarifyItem.itemId,
                    disposition: "clarification",
                    note: clarification,
                    waiveRound: false,
                })) {
                    setClarifyItem(null);
                    setClarification("");
                }
            }}>
            <label>
              What needs clarification?
              <textarea autoFocus value={clarification} onChange={(e) => setClarification(e.target.value)} required minLength={3} maxLength={2000}/>
            </label>
            <div className="button-row">
              <button className="button primary" disabled={busy}>
                Ask for clarification
              </button>
              <button type="button" className="button secondary" onClick={() => setClarifyItem(null)}>
                Cancel
              </button>
            </div>
          </form>)}
        {proposalItem && (<form className="pending-card stacked-form" onSubmit={async (e) => {
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
                    if (ok)
                        setProposalItem(null);
                }
                catch (e) {
                    onNotify((e as Error).message);
                }
            }}>
            <h4>Propose additional work</h4>
            <label>
              What will you add?
              <textarea rows={2} value={proposalItem.description} onChange={(e) => setProposalItem({
                ...proposalItem,
                description: e.target.value,
            })} required/>
            </label>
            <div className="field-grid">
              <label>
                Additional price · USD
                <input inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)}/>
              </label>
              <label>
                New deadline
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}/>
              </label>
            </div>
            <button type="button" className="text-button" onClick={() => setAmount("0.00")}>
              Waive the charge ($0)
            </button>
            <div className="button-row">
              <button className="button primary" disabled={busy}>
                Send proposal
              </button>
              <button type="button" className="button secondary" onClick={() => setProposalItem(null)}>
                Cancel
              </button>
            </div>
          </form>)}
        {p.proposals.map((proposal) => (<div className="pending-card" key={proposal.id}>
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
                : `Decision recorded ${new Date(proposal.decidedAt!).toLocaleDateString()}.`}
            </p>
            {proposal.authorId === actorId &&
                proposal.status === "pending" &&
                proposal.baseAgreementId !== p.activeAgreementId && (<button className="button secondary" disabled={busy} onClick={() => void onCommand({
                    type: "rebaseProposal",
                    projectId: p.id,
                    proposalId: proposal.id,
                })}>
                Update proposal to current terms
              </button>)}
            {proposal.note && <p>{proposal.note}</p>}
            {proposal.status === "pending" && (<p className="fine-print">
                Proposed by {snapshot.people.find((person) => person.id === proposal.authorId)?.name ?? (proposal.authorId === p.workerId
                    ? "Freelancer"
                    : "Employer")} · Awaiting{" "}
                {proposal.authorId === p.workerId ? "employer" : "freelancer"}
                {" "}
                response. Fee approval does not mark payment as paid.
              </p>)}
            {proposal.authorId !== actorId && proposal.status === "pending" && (<div className="button-row">
                <button disabled={busy} className="button primary" onClick={() => void onCommand({
                    type: "decideProposal",
                    projectId: p.id,
                    proposalId: proposal.id,
                    accept: true,
                })}>
                  Accept proposed price
                </button>
                <button className="button secondary" onClick={() => {
                    setCounterId(proposal.id);
                    setCounterNote("");
                    setDeadline(proposal.deadline ?? "");
                    setAmount((Number(proposal.amountMinor) / 100).toFixed(2));
                }}>
                  Counteroffer
                </button>
              </div>)}
          </div>))}
        {counterId && (<form className="stacked-form pending-card" onSubmit={async (e) => {
                e.preventDefault();
                try {
                    if (await onCommand({
                        type: "counterProposal",
                        projectId: p.id,
                        proposalId: counterId,
                        note: counterNote,
                        amountMinor: parseAmount(amount),
                        deadline: deadline || null,
                    }))
                        setCounterId(null);
                }
                catch (e) {
                    onNotify((e as Error).message);
                }
            }}>
            <label>
              Counteroffer price · USD<input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?"/>
            </label>
            <label>
              Proposed due date<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}/>
            </label>
            <label>
              Explanation (optional)<textarea value={counterNote} onChange={(event) => setCounterNote(event.target.value)} maxLength={2000}/>
            </label>
            <button className="button primary" disabled={busy}>
              Send counteroffer
            </button>
            <button className="button secondary" type="button" onClick={() => setCounterId(null)}>
              Cancel
            </button>
          </form>)}
        {!p.revisions.length && p.deliveries.length > 0 && <p className="task-empty">No revisions yet.</p>}
      </section>
    </>);
}
function CommentBox({ projectId, onCommand, busy, }: {
    projectId: string;
    onCommand: (c: Command) => Promise<boolean>;
    busy: boolean;
}) {
    const [comment, setComment] = useState("");
    return (<form className="comment-box" onSubmit={async (e) => {
            e.preventDefault();
            if (await onCommand({ type: "discuss", projectId, text: comment })) {
                setComment("");
            }
        }}>
      <label className="sr-only" htmlFor="comment">
        Discuss this project
      </label>
      <input id="comment" placeholder="Leave a note for the project…" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={3000} required/>
      <button className="icon-button" aria-label="Send comment" disabled={busy || !comment.trim()}>
        <Send size={17}/>
      </button>
    </form>);
}
