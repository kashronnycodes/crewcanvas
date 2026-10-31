import { z } from "zod";
import {
  admin,
  type authenticatedUser,
  body,
  HttpError,
  respond,
} from "./backend.ts";
type Identity = Awaited<ReturnType<typeof authenticatedUser>>;
export async function tokenHash(token: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
  )
    .map((n) => n.toString(16).padStart(2, "0")).join("");
}
export function checked<T>(
  { data, error }: { data: T; error: { message: string } | null },
): T {
  if (error) {
    throw new HttpError(
      error.message.includes("FORBIDDEN") ? 403 : 409,
      "WORKSPACE_ERROR",
      error.message.includes("FORBIDDEN")
        ? "This invitation or workspace is not available to your verified account."
        : "Workspace operation could not complete. Refresh before retrying.",
    );
  }
  return data;
}
export async function onboarding(
  req: Request,
  path: string,
  user: Identity,
): Promise<Response | null> {
  const db = admin();
  if (req.method === "GET" && path === "workspaces") {
    const memberships = checked(
      await db.from("memberships").select(
        "id,workspace_id,access_role,workspaces(id,name,timezone)",
      ).eq("auth_user_id", user.id),
    );
    return respond(req, memberships);
  }
  if (req.method !== "POST") return null;
  if (path === "workspaces/create") {
    const value = z.object({
      name: z.string().trim().min(2).max(80),
      personName: z.string().trim().min(2).max(80),
      timezone: z.string().max(80),
    }).strict().parse(await body(req));
    const id = z.uuid().parse(req.headers.get("Idempotency-Key"));
    const workspaceId = checked(
      await db.rpc("create_workspace", {
        p_auth_id: user.id,
        p_id: id,
        p_name: value.name,
        p_person_name: value.personName,
        p_timezone: value.timezone,
      }),
    );
    return respond(req, { workspaceId });
  }
  if (path === "invites/accept") {
    const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict().parse(await body(req));
    const workspaceId = checked(
      await db.rpc("accept_workspace_invite", {
        p_auth_id: user.id,
        p_hash: await tokenHash(token),
      }),
    );
    return respond(req, { workspaceId });
  }
  return null;
}
