import type { Project } from "../../shared/types";

export default function RevisionNotes({project,employer,busy,onApprove,onRequest,showHistory=true}:{
  showHistory?:boolean;project:Project;employer:boolean;busy:boolean;onApprove:(deliveryId:string)=>void;onRequest:()=>void;
}) {
  const latest=project.deliveries.at(-1);
  if(!latest)return null;
  const approved=project.state==="accepted";
  const awaitingReview=project.state==="submitted" && latest.status==="submitted";
  const canRequest=!!project.activeAgreementId && ["submitted","changes_requested"].includes(project.state);
  return <section className="revision-notes" aria-label="Revision notes">
    <div className="section-heading"><h3>Revision notes</h3><span className={`pill work-${project.state}`}>{approved ? "Approved" : awaitingReview ? "Awaiting review" : "Changes requested"}</span></div>
    <p className="fine-print">Latest submission: {latest.label}</p>
    {showHistory && (project.revisions.length ? <ol className="revision-note-list">
      {project.revisions.map((revision,index)=><li key={revision.id}>
        <strong>Revision {index+1}</strong><p>{revision.text}</p>
        <small>{project.deliveries.find(delivery=>delivery.id===revision.deliveryId)?.label ?? "Submitted work"} · {new Date(revision.createdAt).toLocaleDateString()}</small>
      </li>)}
    </ol> : <p className="fine-print">No revision notes yet. Review the submitted work before approving it or requesting changes.</p>)}
    {!approved && !awaitingReview && <p className="fine-print">Waiting for the freelancer to submit their updated version.</p>}
    {employer && <div className="button-row">
      {awaitingReview && <button className="button primary" disabled={busy} onClick={()=>onApprove(latest.id)}>Approve work</button>}
      {canRequest && <button className="button secondary" disabled={busy} onClick={onRequest}>{project.revisions.length ? "Request another revision" : "Request revision"}</button>}
    </div>}
  </section>;
}
