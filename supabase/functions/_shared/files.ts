import { z } from "zod";
import type { SessionActor, WorkspaceFile } from "../../../shared/types.ts";
import {
  MAX_FILE_BYTES,
  validateFile,
  validateFileBytes,
} from "../../../shared/workspace.ts";
import { admin, authorizedProject, HttpError } from "./backend.ts";
const bucket = "crewcanvas-files";
export async function authorizedFile(
  id: string,
  user: SessionActor,
  write = false,
): Promise<WorkspaceFile> {
  z.uuid().parse(id);
  const { data, error } = await admin().from("workspace_files").select("*").eq(
    "id",
    id,
  ).eq("workspace_id", user.workspaceId).eq("deleted", false).single();
  if (error || !data) throw new HttpError(404, "NOT_FOUND", "File not found.");
  if (user.role !== "employer") {
    if (!data.project_id || write && data.uploaded_by !== user.id) {
      throw new HttpError(
        403,
        "FORBIDDEN",
        "This file is not available to your account.",
      );
    }
    await authorizedProject(data.project_id, user);
  }
  return data.data;
}
async function persistFile(
  file: WorkspaceFile,
  expected: number,
  user: SessionActor,
  remove = false,
) {
  const { data, error } = await admin().rpc("mutate_workspace_file", {
    p_actor_id: user.id,
    p_file: file,
    p_expected: expected,
    p_delete: remove,
  });
  if (error) {
    throw new HttpError(
      error.message.includes("FORBIDDEN") ? 403 : 409,
      "FILE_CONFLICT",
      "File changed or access was denied. Refresh before retrying.",
    );
  }
  return data;
}
export async function uploadFile(req: Request, user: SessionActor) {
  // Bound the actual stream, including clients without Content-Length.
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "VALIDATION", "Choose a file.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > MAX_FILE_BYTES + 65536) {
      await reader.cancel();
      throw new HttpError(413, "TOO_LARGE", "Files must be under 25 MB.");
    }
    chunks.push(next.value);
  }
  const form = await new Response(new Blob(chunks as BlobPart[]), {
    headers: { "Content-Type": req.headers.get("Content-Type") ?? "" },
  }).formData();
  const meta = z.object({
    id: z.uuid(),
    projectId: z.uuid().nullable(),
    expected: z.coerce.number().int().min(0),
    x: z.coerce.number().finite(),
    y: z.coerce.number().finite(),
  }).parse({
    id: form.get("id"),
    projectId: form.get("projectId") || null,
    expected: form.get("expected"),
    x: form.get("x"),
    y: form.get("y"),
  });
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new HttpError(400, "VALIDATION", "Choose a file.");
  }
  let mime: string;
  try {
    mime = validateFile(file);
    validateFileBytes(file.name, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    throw new HttpError(400, "VALIDATION", (error as Error).message);
  }
  let prior: WorkspaceFile | undefined;
  if (meta.expected > 0) {
    prior = await authorizedFile(meta.id, user, true);
    if (prior.version !== meta.expected) {
      throw new HttpError(
        409,
        "CONFLICT",
        "File changed. Refresh before replacing it.",
      );
    }
  }
  const projectId = prior ? prior.projectId : meta.projectId;
  if (projectId) await authorizedProject(projectId, user);
  else if (user.role !== "employer") {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Workers must upload to an assigned project.",
    );
  }
  const now = new Date().toISOString();
  const path = `${user.workspaceId}/${meta.id}/${crypto.randomUUID()}.${
    file.name.split(".").pop()!.toLowerCase()
  }`;
  const storage = admin().storage.from(bucket);
  const result = await storage.upload(path, file, {
    contentType: mime,
    upsert: false,
    cacheControl: "60",
  });
  if (result.error) {
    throw new HttpError(
      502,
      "UPLOAD_FAILED",
      "Storage could not save this file. Retry the upload.",
    );
  }
  const updated: WorkspaceFile = {
    id: meta.id,
    workspaceId: user.workspaceId,
    projectId,
    uploadedBy: prior?.uploadedBy ?? user.id,
    name: prior?.name ?? file.name,
    mime,
    size: file.size,
    x: prior?.x ?? meta.x,
    y: prior?.y ?? meta.y,
    version: meta.expected + 1,
    versions: [...(prior?.versions ?? []), {
      path,
      name: file.name,
      mime,
      size: file.size,
      createdAt: now,
    }],
    createdAt: prior?.createdAt ?? now,
    updatedAt: now,
  };
  try {
    return await persistFile(updated, meta.expected, user);
  } catch (error) {
    await storage.remove([path]);
    throw error;
  }
}
export async function updateFile(input: unknown, user: SessionActor) {
  const value = z.object({
    id: z.uuid(),
    expected: z.number().int(),
    name: z.string().trim().min(1).max(180),
    projectId: z.uuid().nullable(),
    remove: z.boolean().default(false),
  }).strict().parse(input);
  const file = await authorizedFile(value.id, user, true);
  if (value.expected !== file.version) {
    throw new HttpError(
      409,
      "CONFLICT",
      "File changed. Refresh before retrying.",
    );
  }
  if (value.projectId) await authorizedProject(value.projectId, user);
  const changed = {
    ...file,
    name: value.name,
    projectId: value.projectId,
    version: file.version + 1,
    updatedAt: new Date().toISOString(),
  };
  if (value.remove) {
    // Keep submitted evidence available in review history. The user can delete unused files.
    const deliveries = await admin().from("deliveries").select("id").contains(
      "data",
      { fileId: file.id },
    );
    if (deliveries.error) throw deliveries.error;
    if (deliveries.data.length) {
      throw new HttpError(
        409,
        "IN_USE",
        "Submitted deliverables are retained in review history. Upload a new version instead.",
      );
    }
  }
  // An attachment cannot be moved away from the project that holds its submission.
  if (file.projectId !== changed.projectId) {
    const used = await admin().from("deliveries").select("id").contains(
      "data",
      { fileId: file.id },
    );
    if (used.error) throw used.error;
    if (used.data.length) {
      throw new HttpError(
        409,
        "IN_USE",
        "A submitted file must remain attached to its project.",
      );
    }
  }
  const saved = await persistFile(changed, value.expected, user, value.remove);
  if (value.remove) {
    const cleanup = await admin().storage.from(bucket).remove(
      file.versions.map((v) => v.path),
    );
    if (cleanup.error) console.error("File storage cleanup required", file.id);
  }
  return saved;
}
export async function fileUrl(input: unknown, user: SessionActor) {
  const value = z.object({
    id: z.uuid(),
    version: z.number().int().min(0).optional(),
    download: z.boolean().optional(),
  }).strict().parse(input);
  const file = await authorizedFile(value.id, user);
  const version = value.version === undefined
    ? file.versions.at(-1)
    : file.versions[value.version];
  if (!version) {
    throw new HttpError(404, "NOT_FOUND", "File version not found.");
  }
  const { data, error } = await admin().storage.from(bucket).createSignedUrl(
    version.path,
    60,
    { download: value.download ? file.name : false },
  );
  if (error) {
    throw new HttpError(
      502,
      "STORAGE_ERROR",
      "Could not open this file. Retry.",
    );
  }
  return { url: data.signedUrl };
}
