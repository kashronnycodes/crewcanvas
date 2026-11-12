import { useState } from "react";
import type { WorkspaceSnapshot } from "../../shared/types";
import type { Command } from "../../shared/validation";
import { parseAmount, todayIn } from "../../shared/domain";
import { studioProjects } from "../../shared/studio";
import Modal from "./Modal";

export default function TaskForm(
  { snapshot, workerId, parentProjectId, onClose, onSubmit }: {
    snapshot: WorkspaceSnapshot;
    workerId?: string;
    parentProjectId?: string;
    onClose: () => void;
    onSubmit: (c: Command) => Promise<boolean>;
  },
) {
  const workers = snapshot.people.filter((p) => p.accessRole === "worker");
  const [assignee, setAssignee] = useState(workerId ?? "");
  const [projectId, setProjectId] = useState(parentProjectId ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const person = workers.find((p) => p.id === assignee);
  const planning = !person || !!person.sample;
  return (
    <Modal
      title="Add task"
      description={person
        ? `${person.name}${person.sample ? " · Sample planning profile" : " · " + person.role}`
        : "Save now and assign a workspace member later."}
      onClose={onClose}
    >
      <form
        className="stacked-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const fields = new FormData(e.currentTarget);
          try {
            const title = String(fields.get("title")).trim();
            const ok = await onSubmit({
              type: "createProject",
              workerId: assignee || null,
              ...(projectId ? { parentProjectId: projectId } : {}),
              title,
              publish: true,
              terms: {
                brief: String(fields.get("description")).trim(),
                tasks: [title],
                deliverables: [title],
                amountMinor: parseAmount(String(fields.get("price"))),
                currency: "USD",
                deadline: String(fields.get("due")),
                revisionRounds: Number(fields.get("rounds")),
                paymentDays: Number(fields.get("days")),
              },
            });
            if (ok) onClose();
            else {setError(
                "Task was not saved. Review the workspace message and try again.",
              );}
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <button type="button" className="text-button" onClick={onClose}>
          ← Back{workerId ? ` to ${workers.find(p => p.id === workerId)?.name ?? "member"}'s tasks` : " to workspace"}
        </button>
        <label>Assigned member<select aria-label="Assigned member" value={assignee} onChange={e => setAssignee(e.target.value)}>
          <option value="">Unassigned</option>
          {workers.map(p => <option key={p.id} value={p.id}>{p.name}{p.sample ? " · Sample" : ""} · {p.role}</option>)}
        </select></label>
        <label>Project<select aria-label="Project" value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">New standalone project</option>
          {studioProjects(snapshot).filter(p => snapshot.projects.some(t => t.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select></label>
        <label>
          Task title<input
            name="title"
            required
            minLength={2}
            maxLength={120}
            autoFocus
          />
        </label>
        <label>
          Description<textarea
            name="description"
            required
            minLength={10}
            maxLength={20000}
            rows={3}
          />
        </label>
        <div className="field-grid">
          <label>
            Due date<input
              name="due"
              type="date"
              required
              defaultValue={todayIn(
                snapshot.timezone,
                new Date(Date.now() + 7 * 86400000),
              )}
            />
          </label>
          <label>
            Proposed task price · USD<input
              name="price"
              inputMode="decimal"
              required
              defaultValue="0.00"
              pattern="[0-9]+(\.[0-9]{1,2})?"
            />
          </label>
          <label>
            Included revisions<input
              name="rounds"
              type="number"
              min="0"
              max="99"
              required
              defaultValue="0"
            />
          </label>
          <label>
            Payment due after approval<select name="days" defaultValue="7">
              <option value="0">On approval</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </div>
        <label>
          Starting status<select
            aria-label="Starting status"
            defaultValue="awaiting_agreement"
          >
            <option value="awaiting_agreement">
              {planning ? "Planning" : "Awaiting scope & price acceptance"}
            </option>
          </select>
        </label>
        <p className="fine-print">
          Real teammates must accept the proposed scope, price and due date before
          work begins. Acceptance does not mark work approved or paid.
        </p>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            Save task
          </button>
        </div>
      </form>
    </Modal>
  );
}
