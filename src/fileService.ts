import type { WorkspaceFile, WorkspaceSnapshot } from "../shared/types";
import { MAX_FILE_BYTES, validateFile } from "../shared/workspace";
import { api, mode, mutateDemo, repository, supabase } from "./services";
const dbName = "crewcanvas-binary-v1";
async function binary<T>(
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  write = false,
): Promise<T> {
  if (!globalThis.indexedDB) {
    throw new Error(
      "This browser does not support persistent file storage. Use integrated mode or a modern browser.",
    );
  }
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(dbName, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore("files");
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result,
        tx = db.transaction("files", write ? "readwrite" : "readonly"),
        request = operation(tx.objectStore("files"));
      tx.oncomplete = () => {
        resolve(request.result);
        db.close();
      };
      tx.onerror = () => {
        reject(
          tx.error ??
            new Error("Persistent storage failed. Check available disk space."),
        );
        db.close();
      };
      tx.onabort = tx.onerror;
    };
  });
}
function checkWrite(
  s: WorkspaceSnapshot,
  actorId: string,
  projectId: string | null,
  file?: WorkspaceFile,
) {
  const actor = s.people.find((p) => p.id === actorId);
  const project = s.projects.find((p) => p.id === projectId);
  if (
    !actor || projectId && !project ||
    actor.accessRole === "worker" &&
      (!project || project.workerId !== actor.id ||
        file && file.uploadedBy !== actorId)
  ) {
    throw new Error(
      "You can only upload to your assigned projects and edit your own files.",
    );
  }
}
const event = (
  s: WorkspaceSnapshot,
  actorId: string,
  text: string,
  projectId: string | null,
) => {
  s.workspaceActivity = [...(s.workspaceActivity ?? []), {
    id: crypto.randomUUID(),
    actorId,
    text,
    projectId,
    createdAt: new Date().toISOString(),
  }].slice(-200);
};
export const files = {
  async upload(
    file: File,
    options: {
      x: number;
      y: number;
      projectId: string | null;
      replace?: WorkspaceFile;
    },
    onProgress: (n: number) => void,
  ): Promise<WorkspaceFile> {
    const mime = validateFile(file),
      id = options.replace?.id ?? crypto.randomUUID();
    if (mode === "demo") {
      mutateDemo((s, actorId) =>
        checkWrite(
          s,
          actorId,
          options.replace?.projectId ?? options.projectId,
          options.replace,
        )
      );
      const path = `${id}/${crypto.randomUUID()}`;
      onProgress(0);
      await binary((store) => store.put(file, path), true);
      try {
        const saved = mutateDemo((s, actorId) => {
          const prior = s.files?.find((f) => f.id === id),
            now = new Date().toISOString();
          if (options.replace && prior?.version !== options.replace.version) {
            throw new Error("File changed. Refresh before replacing it.");
          }
          checkWrite(s, actorId, prior?.projectId ?? options.projectId, prior);
          const updated: WorkspaceFile = {
            id,
            workspaceId: s.id,
            projectId: prior?.projectId ?? options.projectId,
            uploadedBy: prior?.uploadedBy ?? actorId,
            name: prior?.name ?? file.name,
            mime,
            size: file.size,
            x: options.x,
            y: options.y,
            version: (prior?.version ?? 0) + 1,
            createdAt: prior?.createdAt ?? now,
            updatedAt: now,
            versions: [...(prior?.versions ?? []), {
              path,
              name: file.name,
              mime,
              size: file.size,
              createdAt: now,
            }],
          };
          s.files = [...(s.files ?? []).filter((f) => f.id !== id), updated];
          event(
            s,
            actorId,
            `${
              prior ? "Uploaded a new version" : "Uploaded file"
            }: ${updated.name}`,
            updated.projectId,
          );
          return updated;
        });
        onProgress(100);
        return saved;
      } catch (error) {
        await binary((store) => store.delete(path), true);
        throw error;
      }
    }
    if (!supabase) throw new Error("Configure Supabase before uploading.");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to upload files.");
    const form = new FormData();
    form.set("file", file);
    form.set("id", id);
    form.set("expected", String(options.replace?.version ?? 0));
    form.set("projectId", options.projectId ?? "");
    form.set("x", String(options.x));
    form.set("y", String(options.y));
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crew-api/files/upload`,
      );
      xhr.timeout = 120000;
      xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
      xhr.setRequestHeader(
        "apikey",
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      );
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.min(99, Math.round(e.loaded / e.total * 100)));
        }
      };
      xhr.onerror = () =>
        reject(
          new Error("Upload interrupted. Check your connection and retry."),
        );
      xhr.ontimeout = () =>
        reject(
          new Error(
            "Upload timed out. Refresh to check whether it was saved before retrying.",
          ),
        );
      xhr.onload = () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status < 200 || xhr.status >= 300) {
            throw new Error(result.error?.message ?? "Upload failed.");
          }
          onProgress(100);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      xhr.send(form);
    });
  },
  async update(
    file: WorkspaceFile,
    changes: { name?: string; projectId?: string | null; remove?: boolean },
  ) {
    if (mode === "integrated") {
      return api("files/update", {
        id: file.id,
        expected: file.version,
        name: changes.name ?? file.name,
        projectId: changes.projectId === undefined
          ? file.projectId
          : changes.projectId,
        remove: !!changes.remove,
      });
    }
    const saved = mutateDemo((s, actorId) => {
      const prior = s.files?.find((f) => f.id === file.id);
      if (!prior || prior.version !== file.version) {
        throw new Error("File changed. Refresh before retrying.");
      }
      const projectId = changes.projectId === undefined
        ? prior.projectId
        : changes.projectId;
      checkWrite(s, actorId, projectId, prior);
      if (
        (changes.remove || projectId !== prior.projectId) &&
        s.projects.some((p) => p.deliveries.some((d) => d.fileId === file.id))
      ) {
        throw new Error(
          "Submitted files are retained with their project. Upload a new version instead.",
        );
      }
      const name = (changes.name ?? prior.name).trim();
      if (!name || name.length > 180) {
        throw new Error("Enter a file name under 180 characters.");
      }
      const updated = {
        ...prior,
        name,
        projectId,
        version: prior.version + 1,
        updatedAt: new Date().toISOString(),
      };
      s.files = changes.remove
        ? s.files!.filter((f) => f.id !== file.id)
        : s.files!.map((f) => f.id === file.id ? updated : f);
      if (changes.remove || projectId !== prior.projectId) {
        s.layout.connections = s.layout.connections?.filter((c) =>
          c.source !== `file:${file.id}` && c.target !== `file:${file.id}`
        );
        if (changes.remove) {
          s.layout.cards = s.layout.cards?.filter((c) =>
            c.id !== `file:${file.id}`
          );
        }
        s.layout.version++;
      }
      event(
        s,
        actorId,
        `${changes.remove ? "Deleted" : "Updated"} file: ${updated.name}`,
        updated.projectId,
      );
      return updated;
    });
    if (changes.remove) {
      await Promise.all(
        file.versions.map((v) => binary((store) => store.delete(v.path), true)),
      );
    }
    return saved;
  },
  async url(
    fileId: string,
    version?: number,
    download = false,
  ): Promise<string> {
    if (mode === "integrated") {
      return (await api("files/url", { id: fileId, version, download })).url;
    }
    const s = await repository.load(),
      file = s.files?.find((f) => f.id === fileId);
    const entry = version === undefined
      ? file?.versions.at(-1)
      : file?.versions[version];
    if (!entry) throw new Error("File is no longer available to your account.");
    const blob = await binary((store) => store.get(entry.path)) as
      | Blob
      | undefined;
    if (!blob) {
      throw new Error(
        "This file was removed from browser storage. Upload it again.",
      );
    }
    return URL.createObjectURL(blob);
  },
  maxBytes: MAX_FILE_BYTES,
};
export function releaseFileUrl(url: string) {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}
export async function openFile(
  fileId: string,
  version?: number,
  download = false,
) {
  const url = await files.url(fileId, version, download);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  if (download) {
    const s = await repository.load();
    a.download = s.files?.find((f) => f.id === fileId)?.name ?? "download";
  }
  a.click();
  setTimeout(() => releaseFileUrl(url), 60000);
}
