import { ArrowRight,Sparkles } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { parseAmount,todayIn } from "../../shared/domain";
import type { Agreement,BriefSuggestion,Person,WorkflowCollection,} from "../../shared/types";
import { type Command,termsSchema } from "../../shared/validation";
import { scopeAssistant } from "../services";
import Modal from "./Modal";
export default function ProjectForm({ people, workerId, projectId, current, onClose, onSubmit, task, onEnsureMember, }: {
    people: Person[];
    workerId?: string | null;
    projectId?: string;
    current?: Agreement;
    onClose: () => void;
    onSubmit: (c: Command) => Promise<boolean>;
    onEnsureMember?: (collectionId: string, roleId: string, memberId: string) => Promise<boolean>;
    task?: {
        collection: WorkflowCollection;
        collections?: WorkflowCollection[];
        memberSpecific?: boolean;
        roleId: string;
        memberId?: string;
    };
}) {
    const [collectionId, setCollectionId] = useState(task?.collection.id);
    const taskCollection = task?.collections?.find((c) => c.id === collectionId) ?? task?.collection;
    const [roleId, setRoleId] = useState(task?.roleId ?? "");
    const [publishTask, setPublishTask] = useState(true);
    const defaults = current;
    const [suggestion, setSuggestion] = useState<BriefSuggestion | null>(null);
    const [aiBusy, setAiBusy] = useState(false);
    const [error, setError] = useState("");
    const form = useForm({
        defaultValues: {
            workerId: workerId ?? task?.memberId ?? "",
            title: "",
            brief: defaults?.brief ?? "",
            tasks: defaults?.tasks?.join("\n") ?? "",
            deliverables: defaults?.deliverables.join("\n") ?? "",
            amount: defaults
                ? (Number(defaults.amountMinor) / 100).toFixed(2)
                : task
                    ? "0.00"
                    : "120.00",
            deadline: defaults?.deadline ??
                todayIn("Asia/Manila", new Date(Date.now() + 7 * 86400000)),
            revisionRounds: defaults?.revisionRounds ?? 2,
            paymentDays: defaults?.paymentDays ?? 7,
        },
    });
    const selectedId = form.watch("workerId");
    const selectedMember = people.find(p => p.id === selectedId);
    const planning = !selectedId || !!selectedMember?.sample;
    async function extract() {
        setError("");
        if (form.getValues("brief").length < 10) {
            setError("Paste at least a sentence of your brief first.");
            return;
        }
        setAiBusy(true);
        try {
            setSuggestion(await scopeAssistant.extract(form.getValues("brief")));
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setAiBusy(false);
        }
    }
    return (<Modal wide title={projectId
            ? "Propose updated terms"
            : task
                ? "Add task"
                : "Create task"} description={projectId
            ? "Accepted terms remain in effect until the worker accepts this version."
            : "Save now and assign someone later. Sample profiles are for planning; real teammates accept terms before work starts."} onClose={onClose}>
      <form className="project-form" onSubmit={form.handleSubmit(async (value) => {
            try {
                const terms = termsSchema.parse({
                    brief: value.brief,
                    tasks: value.tasks
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    deliverables: value.deliverables
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    amountMinor: parseAmount(value.amount),
                    currency: "USD",
                    deadline: value.deadline,
                    revisionRounds: Number(value.revisionRounds),
                    paymentDays: Number(value.paymentDays),
                });
                if (task && roleId && value.workerId && onEnsureMember &&
                    !await onEnsureMember(taskCollection!.id, roleId, value.workerId))
                    return;
                const ok = await onSubmit(projectId ? { type: "proposeAgreement", projectId, terms } : {
                    type: "createProject",
                    workerId: value.workerId || null,
                    title: value.title,
                    terms,
                    publish: task ? publishTask : true,
                    ...(task
                        ? {
                            organization: { collectionId: taskCollection!.id, ...(roleId ? { roleId } : {}) },
                        }
                        : {}),
                });
                if (ok)
                    onClose();
            }
            catch (e) {
                setError((e as Error).message);
            }
        })}>
        <button type="button" className="text-button" onClick={onClose}>
          ← Back{projectId
            ? " to task details"
            : task?.memberSpecific
                ? " to member tasks"
                : " to workspace"}
        </button>
        {!projectId && (<>
            {task && !task.memberSpecific && (<label>
                Project<select value={taskCollection!.id} onChange={(e) => {
                    setCollectionId(e.target.value);
                    const role = task.collections?.find((c) => c.id === e.target.value)?.roles[0];
                    setRoleId(role?.id ?? "");
                    form.setValue("workerId", "");
                }}>
                  {(task.collections ?? [task.collection]).map((c) => (<option key={c.id} value={c.id}>{c.title}</option>))}
                </select>
              </label>)}
            {task && !task.memberSpecific && (<label>
                Project role<select value={roleId} onChange={(e) => {
                    setRoleId(e.target.value);
                    form.setValue("workerId", "");
                }}>
                  <option value="">No project role</option>
                  {taskCollection!.roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                </select>
              </label>)}
            <div className="field-grid">
              <label>
                {task ? "Task title" : "Project name"}
                <input {...form.register("title", { required: true })} placeholder="e.g. Launch teaser" required maxLength={120}/>
              </label>
              <label>
                Assigned to<select aria-label="Assigned to" {...form.register("workerId")}>
                  <option value="">Unassigned</option>
                  {people.filter(p => p.accessRole === "worker").map(p => <option key={p.id} value={p.id}>{p.name}{p.sample ? " · Sample" : ""} · {p.role}</option>)}
                </select>
              </label>
            </div>
          </>)}
        <label>
          The brief
          <textarea {...form.register("brief")} rows={4} placeholder="What are we creating? Include the goal, format, references, and anything outside the scope." required minLength={10} maxLength={20000}/>
        </label>
        {task && planning ? <p className="info-note">Planning task · {selectedMember?.sample ? "Sample profiles have no account access." : "Assign someone when ready."}</p> : task && (<label>
            Status<select value={publishTask ? "proposed" : "draft"} onChange={(e) => setPublishTask(e.target.value === "proposed")}>
              <option value="proposed">Awaiting agreement</option>
              <option value="draft">Draft</option>
            </select>
          </label>)}
        <details open={!task} className="task-options">
          <summary>{task ? "Optional planning & AI" : "Planning & AI"}</summary>
          <div className="ai-inline">
            <span>
              <Sparkles size={15}/> AI suggestions
            </span>
            <button type="button" className="button ai-button" onClick={() => void extract()} disabled={aiBusy}>
              {aiBusy ? "Reading your brief…" : "Suggest tasks & deliverables"}
              <ArrowRight size={14}/>
            </button>
          </div>
          {suggestion && (<div className="ai-result">
              <span className="eyebrow">
                {"AI suggestions — review before using"}
              </span>
              <ul>
                {suggestion.tasks.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
              {suggestion.questions.map((q, i) => <p key={i}>{q}</p>)}
              <button type="button" className="text-button" onClick={() => {
                form.setValue("deliverables", suggestion.deliverables.join("\n"));
                form.setValue("tasks", suggestion.tasks.join("\n"));
            }}>
                Use suggestions
              </button>
            </div>)}
          <label>
            Proposed tasks <small>Optional · one per line</small>
            <textarea {...form.register("tasks")} rows={2} placeholder="Plan the edit&#10;Prepare the final export"/>
          </label>
        </details>
        <label>
          Deliverables <small>One per line · editable before proposing</small>
          <textarea {...form.register("deliverables")} rows={3} required placeholder="One 30-second video, 1080p&#10;One final MP4 export"/>
        </label>
        {task && (<label>
            Delivery deadline<input type="date" {...form.register("deadline")} required/>
          </label>)}
        <section className="task-payment-fields">
          <h3>
            {task
            ? "Price & payment"
            : "Agreement options · price, included revisions & payment terms"}
          </h3>
          <div className="field-grid">
            <label>
              Agreed price <small>USD</small>
              <div className="money-input">
                <span>$</span>
                <input {...form.register("amount")} inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,2})?"/>
              </div>
            </label>
            {!task && (<label>
                Delivery deadline
                <input type="date" {...form.register("deadline")} required/>
              </label>)}
            <label>
              Included revision rounds
              <input type="number" min="0" max="99" {...form.register("revisionRounds")} required/>
            </label>
            <label>
              Payment due after acceptance
              <select {...form.register("paymentDays")}>
                <option value="0">On acceptance</option>
                <option value="7">7 calendar days</option>
                <option value="14">14 calendar days</option>
                <option value="30">30 calendar days</option>
              </select>
            </label>
          </div>
        </section>
        <div className="info-note">
          {planning ? "Saved for planning. Real teammates review and accept terms before work starts." : "Both people must accept these terms. Sandbox payments require a connected seller."}
        </div>
        {error && (<p className="error-message" role="alert">
            {error}
          </p>)}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={form.formState.isSubmitting}>
            {task
            ? planning ? "Save task" : !publishTask
                ? "Create draft task"
                : "Create task & propose terms"
            : "Propose agreement"}
            <ArrowRight size={15}/>
          </button>
        </div>
      </form>
    </Modal>);
}
