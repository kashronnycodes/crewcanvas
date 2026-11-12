import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Person, WorkspaceSnapshot } from "../../shared/types";
import { invitationSchema } from "../../shared/validation";
import { api } from "../services";
import Avatar from "./Avatar";
import Modal from "./Modal";
import MemberInfo from "./MemberInfo";

export default function TeamMembers({ snapshot, onInvite }: {
  snapshot: WorkspaceSnapshot; onInvite: () => void;
}) {
  const [viewing,setViewing]=useState<Person|null>(null);
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const canManage = snapshot.people.find(p => p.id === snapshot.actorId)?.accessRole === "employer";
  return <section className="team-members" aria-label="Team members">
    <div className="team-heading"><h3>Team members</h3>
      {canManage && <button className="button primary" onClick={() => setEditing("new")}>Add member</button>}
    </div>
    <ul className="team-member-list">
      {snapshot.people.map(person => <li key={person.id}>
        <Avatar person={person} size={34} />
        <button className="team-member-details text-button" aria-label={`Open member ${person.name}`} onClick={()=>setViewing(person)}><strong>{person.name} {person.sample && <small className="sample-member-label">Sample</small>}</strong><span>{person.role}</span></button>
        {person.accessRole === "employer" ? <small>Owner</small> : canManage && <details className="member-actions">
          <summary aria-label={`Actions for ${person.name}`}>•••</summary>
          <button className="button secondary" onClick={event => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            setEditing(person);
          }}>Edit member</button>
        </details>}
      </li>)}
    </ul>
    {snapshot.people.some(p => p.sample) && <p className="fine-print">Sample members are planning profiles. They have no account access.</p>}
    {canManage && <p className="fine-print">Need to give someone account access? <button className="text-button" onClick={onInvite}>Invite account</button></p>}
    {viewing && <MemberInfo person={viewing} role={snapshot.layout.workflow?.flatMap(c=>c.roles).find(r=>r.members.includes(viewing.id))?.name} onClose={()=>setViewing(null)}/>}
    {canManage && editing && <MemberForm key={editing === "new" ? "new" : editing.id} person={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
  </section>;
}

function MemberForm({ person, onClose }: { person?: Person; onClose: () => void }) {
  const cache = useQueryClient();
  // A stable ID makes an explicit retry safe if the first response was lost.
  const [requestId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState(person?.role ?? "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <Modal title={person ? "Edit member" : "Add member"}
    description={person ? "Update their name and display role. Account permissions stay the same." : "Add one person to your team. Send an invitation separately when they need to sign in."}
    onClose={() => { if (!busy) onClose(); }}>
    <form className="stacked-form" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      const values = { name: name.trim(), role: role.trim() };
      if (values.name.length < 2 || values.role.length < 2) { setError("Enter a name and role with at least two characters."); return; }
      if (!person && !invitationSchema.safeParse({ ...values, email: email.trim() }).success) { setError("Enter a valid name, role and email address."); return; }
      setBusy(true); setError("");
      try {
        await api(person ? "members/update" : "members/create", person ? { id: person.id, ...values } : { ...values, email: email.trim() }, requestId);
        await cache.invalidateQueries({ queryKey: ["workspace"] });
        onClose();
      } catch (err) { setError((err as Error).message); }
      finally { setBusy(false); }
    }}>
      <label>Member name<input value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} /></label>
      {!person && <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></label>}
      <label>Role<input value={role} onChange={e => setRole(e.target.value)} required minLength={2} maxLength={80} /></label>
      {error && <p role="alert" className="error-message">{error}</p>}
      <div className="button-row">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={busy}>{person ? "Save member" : "Add member"}</button>
      </div>
    </form>
  </Modal>;
}
