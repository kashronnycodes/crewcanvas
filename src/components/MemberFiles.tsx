import { useState } from "react";
import type { Project, WorkspaceSnapshot } from "../../shared/types";
import Modal from "./Modal";
import { FilePicker, FilePreview } from "./WorkspaceFiles";

export default function MemberFiles({ snapshot, project }: { snapshot: WorkspaceSnapshot; project: Project }) {
  const [preview, setPreview] = useState<string | null>(null);
  const files = (snapshot.files ?? []).filter(f => f.projectId === project.id && f.purpose !== "revision_reference");
  const file = files.find(f => f.id === preview);
  return <section aria-label="Member files" className="member-files">
    <div className="section-heading"><span className="fine-print">Private task files</span><FilePicker snapshot={snapshot} projectId={project.id} compact /></div>
    <div className="member-file-grid">
      {files.map(file => <button className="member-file-card" key={file.id} onClick={() => setPreview(file.id)}>
        <div className="member-file-thumbnail"><FilePreview file={file} thumbnail /></div>
        <strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB · v{file.versions.length}</small>
      </button>)}
    </div>
    {!files.length && <p className="task-empty">No files uploaded yet.</p>}
    {file && <Modal title={file.name} onClose={() => setPreview(null)} wide><div className="file-large-preview"><FilePreview file={file} full /></div></Modal>}
  </section>;
}
