import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Maximize2, Upload, X } from "lucide-react";
import type { WorkspaceFile, WorkspaceSnapshot } from "../../shared/types";
import { files, openFile, releaseFileUrl } from "../fileService";
import { mode } from "../services";
import Modal from "./Modal";

export function FilePreview(
  { file, version, full = false }: {
    file: WorkspaceFile;
    version?: number;
    full?: boolean;
  },
) {
  const [url, setUrl] = useState(""), [error, setError] = useState("");
  const entry = version === undefined
    ? file.versions.at(-1)
    : file.versions[version];
  useEffect(() => {
    let active = true, current = "";
    setUrl("");
    setError("");
    const load = () =>
      void files.url(file.id, version).then((next) => {
        if (!active) {
          releaseFileUrl(next);
          return;
        }
        releaseFileUrl(current);
        current = next;
        setUrl(next);
      }).catch((e) => active && setError(e.message));
    load();
    const timer = mode === "integrated" ? setInterval(load, 50000) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
      releaseFileUrl(current);
    };
  }, [file.id, entry?.path, version]);
  if (error) {
    return <span className="file-preview-error" role="alert">{error}</span>;
  }
  if (!url) {
    return (
      <span className="file-preview-loading" role="status">
        Loading preview…
      </span>
    );
  }
  const mime = entry?.mime ?? file.mime;
  if (mime.startsWith("image/")) {
    return <img src={url} alt={file.name} loading="lazy" />;
  }
  if (mime.startsWith("video/")) {
    return (
      <video src={url} controls preload="metadata" className="nodrag nowheel" />
    );
  }
  if (mime.startsWith("audio/")) {
    return (
      <audio src={url} controls preload="metadata" className="nodrag nowheel" />
    );
  }
  if (mime === "application/pdf") {
    return (
      <iframe
        title={file.name}
        src={`${url}#toolbar=${full ? 1 : 0}`}
        sandbox="allow-scripts allow-same-origin"
        className="nodrag nowheel"
      />
    );
  }
  return (
    <div className="generic-file">
      <FileText size={full ? 60 : 32} />
      <span>{file.name.split(".").pop()?.toUpperCase()} file</span>
      <small>Download to open in its native app</small>
    </div>
  );
}
export function FilePicker(
  { snapshot, projectId = null, onUploaded, compact = false }: {
    snapshot: WorkspaceSnapshot;
    projectId?: string | null;
    onUploaded?: (file: WorkspaceFile) => void;
    compact?: boolean;
  },
) {
  const input = useRef<HTMLInputElement>(null), client = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState("");
  return (
    <div className={`file-picker ${compact ? "compact" : ""}`}>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={async (e) => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = "";
          setError("");
          try {
            for (const file of chosen) {
              setProgress(0);
              const saved = await files.upload(file, {
                projectId,
                x: 350,
                y: 350,
              }, setProgress);
              onUploaded?.(saved);
            }
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setProgress(null);
            await client.invalidateQueries({ queryKey: ["workspace"] });
          }
        }}
      />
      <button
        className="button secondary"
        disabled={progress !== null}
        onClick={() => input.current?.click()}
      >
        <Upload size={15} />
        {progress === null
          ? "Upload files"
          : progress === 99
          ? "Saving securely…"
          : `Uploading ${progress}%`}
      </button>
      {!compact && (
        <small>
          Images, video, PDF, documents and creative files · up to 25 MB each ·
          {" "}
          {mode === "demo"
            ? "saved in this browser"
            : "private workspace storage"}
        </small>
      )}
      {error && <p role="alert" className="error-message">{error}</p>}
      <span hidden>{snapshot.id}</span>
    </div>
  );
}
export function FileInspector(
  { file, snapshot, onClose, onNotify }: {
    file: WorkspaceFile;
    snapshot: WorkspaceSnapshot;
    onClose: () => void;
    onNotify: (s: string) => void;
  },
) {
  const client = useQueryClient(),
    [name, setName] = useState(file.name),
    [projectId, setProjectId] = useState(file.projectId ?? ""),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState(false),
    [preview, setPreview] = useState<number | null>(null),
    [error, setError] = useState("");
  const actor = snapshot.people.find((p) => p.id === snapshot.actorId),
    canEdit = actor?.accessRole === "employer" || actor?.id === file.uploadedBy;
  const replacement = useRef<HTMLInputElement>(null);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["workspace"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="inspector-heading">
        <span>
          FILE · {file.versions.length}{" "}
          version{file.versions.length === 1 ? "" : "s"}
        </span>
        <button aria-label="Close inspector" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="inspector-preview">
        <FilePreview file={file} />
      </div>
      <strong>{file.name}</strong>
      <small>
        {(file.size / 1024 / 1024).toFixed(2)} MB ·{" "}
        {mode === "demo" ? "Stored in this browser" : "Private storage"}
      </small>
      <div className="inspector-actions">
        <button
          className="button secondary"
          onClick={() => setPreview(file.versions.length - 1)}
        >
          <Maximize2 size={14} />Preview
        </button>
        <button
          className="button secondary"
          onClick={() =>
            void openFile(file.id, undefined, true).catch((e) =>
              onNotify(e.message)
            )}
        >
          <Download size={14} />Download
        </button>
      </div>
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              files.update(file, { name, projectId: projectId || null })
            );
          }}
        >
          <label>
            File name<input
              required
              maxLength={180}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Attach to project<select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {actor?.accessRole === "employer" && (
                <option value="">Workspace reference</option>
              )}
              {snapshot.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </label>
          <button className="button secondary" disabled={busy}>
            Save details
          </button>
        </form>
      )}
      {canEdit && (
        <>
          <input
            hidden
            type="file"
            ref={replacement}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) {
                void run(() =>
                  files.upload(f, {
                    x: file.x,
                    y: file.y,
                    projectId: file.projectId,
                    replace: file,
                  }, () => {})
                );
              }
            }}
          />
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => replacement.current?.click()}
          >
            Replace with new version
          </button>
        </>
      )}
      <details>
        <summary>Version history</summary>
        {file.versions.map((v, i) => (
          <button
            className="version-row"
            key={v.path}
            onClick={() => setPreview(i)}
          >
            v{i + 1} · {v.name}
            <small>{new Date(v.createdAt).toLocaleString()}</small>
          </button>
        ))}
      </details>
      {canEdit && (
        <button
          className="text-danger"
          disabled={busy}
          onClick={() => setRemove(true)}
        >
          Delete file…
        </button>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
      {remove && (
        <Modal
          title="Delete this file?"
          description="Stored file versions will be removed."
          onClose={() => setRemove(false)}
        >
          <p>
            Delete “{file.name}” and its stored versions? Submitted deliverables
            are retained as review evidence.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setRemove(false)}
            >
              Keep file
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await files.update(file, { remove: true });
                  onClose();
                })}
            >
              Delete file
            </button>
          </div>
        </Modal>
      )}
      {preview !== null && (
        <Modal
          title={`${file.name} · v${preview + 1}`}
          description="Preview of the selected stored version."
          onClose={() => setPreview(null)}
          wide
        >
          <div className="fullscreen-file">
            <FilePreview file={file} version={preview} full />
          </div>
        </Modal>
      )}
    </>
  );
}
