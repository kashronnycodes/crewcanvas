import { createClient } from "npm:@supabase/supabase-js@2.80.0";
import { assertProjectAccess, DomainError } from "../../../shared/domain.ts";
import type {
  Person,
  Project,
  SessionActor,
  WorkspaceSnapshot,
} from "../../../shared/types.ts";
export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new HttpError(
      503,
      "NOT_CONFIGURED",
      `Server configuration is missing ${name}.`,
    );
  }
  return value;
}
export const admin = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function headers(req: Request) {
  const origin = req.headers.get("Origin");
  const allowed = allowedOrigins();
  return {
    "Content-Type": "application/json",
    ...(origin && allowed.includes(origin)
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : {}),
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, idempotency-key, x-client-info, x-workspace-id",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}
export function allowedOrigins(): string[] {
  return [
    Deno.env.get("ALLOWED_ORIGIN"),
    ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(","),
  ]
    .filter((value): value is string => !!value?.trim()).map((value) =>
      value.trim()
    );
}
export function respond(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}
export function errorResponse(req: Request, error: unknown) {
  if (error instanceof HttpError) {
    return respond(
      req,
      { error: { code: error.code, message: error.message } },
      error.status,
    );
  }
  if (error instanceof DomainError) {
    return respond(
      req,
      { error: { code: error.code, message: error.message } },
      error.code === "FORBIDDEN" ? 403 : error.code === "CONFLICT" ? 409 : 400,
    );
  }
  if (error && typeof error === "object" && "issues" in error) {
    return respond(
      req,
      {
        error: {
          code: "VALIDATION",
          message: "Check the submitted fields.",
          details: (error as { issues: unknown }).issues,
        },
      },
      400,
    );
  }
  console.error(
    "CrewCanvas server error",
    error instanceof Error ? error.message : "Unknown error",
  );
  return respond(
    req,
    {
      error: {
        code: "SERVER_ERROR",
        message:
          "The server could not complete this operation. Retry or check the server logs.",
      },
    },
    500,
  );
}
export async function body(req: Request) {
  const text = await req.text();
  if (text.length > 60000) {
    throw new HttpError(413, "TOO_LARGE", "This request is too large.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "VALIDATION", "Send a JSON request body.");
  }
}
export async function authenticatedUser(req: Request) {
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) {
    throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }
  const db = admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(
      401,
      "UNAUTHENTICATED",
      "Your session expired. Sign in again.",
    );
  }
  return data.user;
}
export async function actor(
  req: Request,
  identity?: Awaited<ReturnType<typeof authenticatedUser>>,
): Promise<SessionActor & { authUserId: string; email: string }> {
  const user = identity ?? await authenticatedUser(req);
  const workspaceId = req.headers.get("X-Workspace-Id");
  if (workspaceId && !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    throw new HttpError(400, "VALIDATION", "Invalid workspace.");
  }
  let query = admin()
    .from("memberships")
    .select("*")
    .eq("auth_user_id", user.id);
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const membership = await query.single();
  if (membership.error || !membership.data) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "Your account has not been invited to this workspace.",
    );
  }
  return {
    id: membership.data.id,
    role: membership.data.access_role,
    workspaceId: membership.data.workspace_id,
    authUserId: user.id,
    email: user.email ?? "",
  };
}
const children = {
  agreements: "agreements",
  deliveries: "deliveries",
  revisions: "revisions",
  proposals: "proposals",
  invoices: "invoices",
  activity: "activity_events",
} as const;
export async function loadProject(id: string): Promise<Project> {
  const db = admin();
  const row = await db.from("projects").select("*").eq("id", id).single();
  if (row.error || !row.data) {
    throw new HttpError(404, "NOT_FOUND", "Project not found.");
  }
  const p = { ...row.data.data, version: row.data.version } as Project;
  await Promise.all(
    Object.entries(children).map(async ([field, table]) => {
      const records = await db.from(table).select("data").eq("project_id", id);
      if (records.error) throw records.error;
      (p as unknown as Record<string, unknown>)[field] = records.data
        .map((x) => x.data)
        .sort((a, b) =>
          (a.createdAt ?? a.submittedAt ?? a.syncedAt ?? "").localeCompare(
            b.createdAt ?? b.submittedAt ?? b.syncedAt ?? "",
          )
        );
    }),
  );
  return p;
}
export async function authorizedProject(id: string, user: SessionActor) {
  const p = await loadProject(id);
  assertProjectAccess(user, p);
  return p;
}
export async function commit(
  p: Project,
  user: SessionActor,
  expected: number,
  requestId: string = crypto.randomUUID(),
) {
  const { error, data } = await admin().rpc("commit_project", {
    p_actor_id: user.id,
    p_project: p,
    p_expected: expected,
    p_request_id: requestId,
  });
  if (error) {
    if (error.message.includes("CONFLICT") || error.code === "23505") {
      throw new DomainError(
        "CONFLICT",
        "This project changed or the operation is already in progress. Refresh and retry.",
      );
    }
    if (error.message.includes("FORBIDDEN")) {
      throw new DomainError(
        "FORBIDDEN",
        "You do not have permission to make this change.",
      );
    }
    throw error;
  }
  return data;
}
export async function providerStore(
  action: string,
  payload: Record<string, unknown> = {},
) {
  const result = await admin().rpc("provider_store", {
    p_action: action,
    p_payload: payload,
  });
  if (result.error) throw result.error;
  return result.data;
}
export async function snapshot(user: SessionActor): Promise<WorkspaceSnapshot> {
  const db = admin();
  const ws = await db
    .from("workspaces")
    .select("*")
    .eq("id", user.workspaceId)
    .single();
  if (ws.error) throw ws.error;
  let membersQuery = db
    .from("memberships")
    .select("data")
    .eq("workspace_id", user.workspaceId);
  if (user.role === "worker") membersQuery = membersQuery.eq("id", user.id);
  const members = await membersQuery;
  if (members.error) throw members.error;
  const people = members.data.map((x) => x.data as Person);
  await Promise.all(
    people.map(async (person) => {
      person.connected = person.accessRole === "worker" &&
        !!(await providerStore("seller", { workerId: person.id }));
    }),
  );
  let projectQuery = db
    .from("projects")
    .select("id")
    .eq("workspace_id", user.workspaceId);
  if (user.role === "worker") {
    projectQuery = projectQuery.eq("worker_id", user.id);
  }
  const projects = await projectQuery;
  if (projects.error) throw projects.error;
  const layout = user.role === "employer"
    ? await db
      .from("canvas_layouts")
      .select("data")
      .eq("workspace_id", user.workspaceId)
      .single()
    : null;
  if (layout?.error) throw layout.error;
  let filesQuery = db.from("workspace_files").select("data,project_id").eq(
    "workspace_id",
    user.workspaceId,
  ).eq("deleted", false);
  let activityQuery = db.from("workspace_activity").select("*").eq(
    "workspace_id",
    user.workspaceId,
  ).order("created_at", { ascending: false }).limit(100);
  if (user.role === "worker") {
    const ids = projects.data.map((p) => p.id);
    filesQuery = filesQuery.in("project_id", ids);
    activityQuery = activityQuery.in("project_id", ids);
  }
  const [files, activity, notifications] = await Promise.all([
    filesQuery,
    activityQuery,
    db.from("notifications").select("*").eq("recipient_id", user.id).eq(
      "workspace_id",
      user.workspaceId,
    )
      .order("created_at", { ascending: false }).limit(100),
  ]);
  if (files.error) throw files.error;
  if (activity.error) throw activity.error;
  if (notifications.error) throw notifications.error;
  return {
    notifications: notifications.data,
    files: files.data.map((f) => f.data),
    workspaceActivity: activity.data.map((e) => ({
      id: e.id,
      actorId: e.actor_id,
      projectId: e.project_id,
      text: e.text,
      createdAt: e.created_at,
    })),
    id: ws.data.id,
    name: ws.data.name,
    timezone: ws.data.timezone,
    people,
    projects: await Promise.all(projects.data.map((p) => loadProject(p.id))),
    layout: layout?.data?.data ?? {
      schemaVersion: 1,
      version: 0,
      people: [],
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    actorId: user.id,
    sellerConnectionId: "",
  };
}
