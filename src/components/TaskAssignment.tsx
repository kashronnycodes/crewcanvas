import { useEffect, useState } from "react";
import type { Person, Project } from "../../shared/types";
import type { Command } from "../../shared/validation";

export default function TaskAssignment({ task, people, onCommand, busy }: {
  task: Project; people: Person[]; onCommand: (command: Command) => Promise<boolean>; busy: boolean;
}) {
  const [assignee, setAssignee] = useState(task.workerId ?? "");
  const [error, setError] = useState("");
  useEffect(() => setAssignee(task.workerId ?? ""), [task.id, task.workerId]);
  const [saving, setSaving] = useState(false);
  const locked = !!task.activeAgreementId || !!task.deliveries.length || !!task.invoices.length || !!task.revisions.length || !!task.proposals.length;
  return <form className="task-assignment stacked-form" onSubmit={async event => {
    event.preventDefault();
    if (busy || saving) return;
    setSaving(true); setError("");
    try {
      if (!await onCommand({ type: "assignTask", projectId: task.id, workerId: assignee || null })) setError("Assignment was not saved. Check the workspace message and try again.");
    } catch (err) { setError((err as Error).message); }
    finally { setSaving(false); }
  }}>
    <label>Assigned to<select aria-label="Task assignee" value={assignee} disabled={busy || saving} onChange={e => {if (locked) {setError("This task has agreed work or payment history. Keep its assignee and create a new task for different work.");return;}setError("");setAssignee(e.target.value);}}>
      <option value="">Unassigned</option>
      {people.filter(p => p.accessRole === "worker").map(p => <option key={p.id} value={p.id}>{p.name}{p.sample ? " · Sample" : ""} · {p.role}</option>)}
    </select></label>
    {!locked && <button className="button secondary" disabled={busy || saving || (assignee || null) === task.workerId}>Save assignment</button>}
    {people.find(p => p.id === task.workerId)?.sample && <p className="fine-print">Sample member · planning only. No invitation or account access.</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
  </form>;
}
