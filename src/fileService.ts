import { responseError } from "../shared/http-errors";
import type { WorkspaceFile } from "../shared/types";
import { MAX_FILE_BYTES,validateFile } from "../shared/workspace";
import { api,repository,supabase,workspaceHeaders } from "./services";
export const files = {
  async upload(
    file: File,
    options: {
      x: number;
      y: number;
      projectId: string | null;
      replace?: WorkspaceFile;
      purpose?: "revision_reference";
    },
    onProgress: (n: number) => void,
  ): Promise<WorkspaceFile> {
    const mime = validateFile(file),
      id = options.replace?.id ?? crypto.randomUUID();
    if (!supabase) throw new Error("Configure Supabase before uploading.");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sign in to upload files.");
    const form = new FormData();
    form.set("file", file);
    form.set("id", id);
    form.set("expected", String(options.replace?.version ?? 0));
    form.set("projectId", options.projectId ?? "");
    if (options.purpose) form.set("purpose", options.purpose);
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
      for (const [name, value] of Object.entries(workspaceHeaders())) {
        xhr.setRequestHeader(name, value);
      }
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
            throw responseError(xhr.status, xhr.getResponseHeader("Retry-After"), result);
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
    return api("files/update", {
      id: file.id, expected: file.version, name: changes.name ?? file.name,
      projectId: changes.projectId === undefined ? file.projectId : changes.projectId,
      remove: !!changes.remove,
    });
  },
  async url(fileId: string, version?: number, download = false): Promise<string> {
    return (await api("files/url", { id: fileId, version, download })).url;
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
