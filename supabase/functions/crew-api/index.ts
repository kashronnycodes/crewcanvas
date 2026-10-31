import { z } from "zod";
import { commandSchema, layoutSchema } from "../../../shared/validation.ts";
import {
  assertProjectAccess,
  DomainError,
  execute,
  makeAgreement,
  uid,
} from "../../../shared/domain.ts";
import type { Project } from "../../../shared/types.ts";
import {
  actor,
  admin,
  allowedOrigins,
  authenticatedUser,
  authorizedProject,
  body,
  commit,
  env,
  errorResponse,
  HttpError,
  providerStore,
  respond,
  snapshot,
} from "../_shared/backend.ts";
import { compareRevision, extractBrief } from "../_shared/ai.ts";
import {
  issueInvoice,
  reconcileProject,
  verifySandboxCredentials,
} from "../_shared/paypal.ts";
import {
  authorizedFile,
  fileUrl,
  updateFile,
  uploadFile,
} from "../_shared/files.ts";
import { validateCanvas } from "../../../shared/workspace.ts";
import { workspaceCommand } from "../_shared/workspace-ai.ts";
import { checked, onboarding, tokenHash } from "../_shared/onboarding.ts";
const idBody = z.object({ projectId: z.uuid() }).strict();
export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return respond(req, {});
  try {
    const origin = req.headers.get("Origin");
    if (origin && !allowedOrigins().includes(origin)) {
      throw new HttpError(
        403,
        "FORBIDDEN",
        "This browser origin is not permitted.",
      );
    }
    const path = new URL(req.url).pathname.split("/crew-api/")[1] ?? "";
    const identity = await authenticatedUser(req);
    const setup = await onboarding(req, path, identity);
    if (setup) return setup;
    const user = await actor(req, identity);
    if (req.method === "GET" && path === "snapshot") {
      return respond(req, await snapshot(user));
    }
    if (req.method === "GET" && path === "members") {
      if (user.role !== "employer") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only the employer can manage team members.",
        );
      }
      const records = checked(
        await admin().from("memberships").select("data").eq(
          "workspace_id",
          user.workspaceId,
        ).eq("access_role", "worker"),
      );
      return respond(req, (records ?? []).map((row) => row.data));
    }
    if (req.method !== "POST") {
      throw new HttpError(404, "NOT_FOUND", "Endpoint not found.");
    }
    if (path === "files/upload") {
      return respond(req, await uploadFile(req, user));
    }
    const input = await body(req);
    if (path === "payments/verify-configuration") {
      if (user.role !== "employer") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only the workspace owner can verify provider configuration.",
        );
      }
      z.object({}).strict().parse(input);
      return respond(req, await verifySandboxCredentials());
    }
    if (path === "members/update") {
      if (user.role !== "employer") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only the employer can manage team members.",
        );
      }
      const value = z.object({
        id: z.uuid(),
        name: z.string().trim().min(2).max(80),
        role: z.string().trim().min(2).max(80),
      }).strict().parse(input);
      const record = checked(
        await admin().from("memberships").select("data").eq("id", value.id).eq(
          "workspace_id",
          user.workspaceId,
        ).eq("access_role", "worker").single(),
      );
      if (!record) throw new HttpError(404, "NOT_FOUND", "Member not found.");
      const person = {
        ...record.data,
        name: value.name,
        role: value.role,
        initials: value.name.split(" ").map((s) => s[0]).slice(0, 2).join(""),
      };
      checked(
        await admin().from("memberships").update({ data: person }).eq(
          "id",
          value.id,
        ).eq("workspace_id", user.workspaceId).eq("access_role", "worker"),
      );
      return respond(req, { ok: true });
    }
    if (path === "notifications/read") {
      const { id } = z.object({ id: z.uuid() }).strict().parse(input);
      checked(
        await admin().from("notifications").update({
          read_at: new Date().toISOString(),
        })
          .eq("id", id).eq("recipient_id", user.id).eq(
            "workspace_id",
            user.workspaceId,
          ),
      );
      return respond(req, { ok: true });
    }
    if (path === "workspaces/update") {
      if (user.role !== "employer") {
        throw new HttpError(
          403,
          "FORBIDDEN",
          "Only the workspace owner can edit workspace settings.",
        );
      }
      const value = z.object({
        name: z.string().trim().min(2).max(80),
        timezone: z.string().max(80),
      }).strict().parse(input);
      try {
        new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format();
      } catch {
        throw new HttpError(400, "VALIDATION", "Choose a valid timezone.");
      }
      checked(
        await admin().from("workspaces").update(value).eq(
          "id",
          user.workspaceId,
        ),
      );
      return respond(req, { ok: true });
    }
    if (path === "files/update") {
      return respond(req, await updateFile(input, user));
    }
    if (path === "files/url") return respond(req, await fileUrl(input, user));
    if (path === "ai/workspace") {
      return respond(req, await workspaceCommand(input, user));
    }
    if (path === "command") {
      const command = commandSchema.parse(input);
      const requestId = z.uuid().parse(req.headers.get("Idempotency-Key"));
      if (["simulateInvoice", "simulatePayment"].includes(command.type)) {
        throw new DomainError(
          "FORBIDDEN",
          "Simulation commands are not available in integrated mode.",
        );
      }
      const prior = await providerStore("command_result", {
        requestId,
        actorId: user.id,
      });
      if (prior) {
        return respond(req, { projectId: prior.project_id, duplicate: true });
      }
      if (command.type === "createProject") {
        if (user.role !== "employer") {
          throw new DomainError(
            "FORBIDDEN",
            "Only the employer can create projects.",
          );
        }
        const a = makeAgreement(command.terms, user.id, null);
        a.status = command.publish ? "proposed" : "draft";
        const p: Project = {
          id: uid(),
          workspaceId: user.workspaceId,
          workerId: command.workerId,
          title: command.title,
          state: "awaiting_agreement",
          origin: "sandbox",
          activeAgreementId: null,
          agreements: [a],
          deliveries: [],
          revisions: [],
          proposals: [],
          invoices: [],
          activity: [
            {
              id: uid(),
              actorId: user.id,
              text: "Proposed a new project agreement.",
              createdAt: new Date().toISOString(),
            },
          ],
          version: 0,
        };
        return respond(req, await commit(p, user, -1, requestId));
      }
      const p = await authorizedProject(command.projectId, user);
      if (command.type === "submitFileDelivery") {
        const file = await authorizedFile(command.fileId, user);
        if (file.projectId !== p.id || !file.versions[command.fileVersion]) {
          throw new HttpError(
            400,
            "VALIDATION",
            "Attach an existing file version to this project first.",
          );
        }
      }
      const changed = execute(p, command, user);
      if (changed === p) {
        return respond(req, { projectId: p.id, duplicate: true });
      }
      return respond(req, await commit(changed, user, p.version, requestId));
    }
    if (path === "layout") {
      if (user.role !== "employer") {
        throw new DomainError(
          "FORBIDDEN",
          "Only the employer can edit the canvas.",
        );
      }
      const layout = layoutSchema.parse(input);
      validateCanvas(await snapshot(user), layout);
      const { data, error } = await admin().rpc("save_canvas", {
        p_actor_id: user.id,
        p_layout: layout,
        p_expected: layout.version,
      });
      if (error) {
        throw new DomainError(
          "CONFLICT",
          "Layout changed. Reload the latest workspace before saving.",
        );
      }
      return respond(req, data);
    }
    if (path === "ai/brief") {
      if (user.role !== "employer") {
        throw new DomainError(
          "FORBIDDEN",
          "Only the employer can draft project briefs.",
        );
      }
      const { brief } = z
        .object({ brief: z.string().min(10).max(20000) })
        .strict()
        .parse(input);
      return respond(req, await extractBrief(brief, user));
    }
    if (path === "ai/revision") {
      const { projectId, text } = z
        .object({ projectId: z.uuid(), text: z.string().min(3).max(10000) })
        .strict()
        .parse(input);
      const p = await authorizedProject(projectId, user);
      return respond(req, await compareRevision(p, text, user));
    }
    if (path === "payments/issue") {
      const { projectId } = idBody.parse(input);
      const requestId = z.uuid().parse(req.headers.get("Idempotency-Key"));
      return respond(req, await issueInvoice(projectId, user, requestId));
    }
    if (path === "payments/reconcile") {
      const { projectId } = idBody.parse(input);
      await reconcileProject(projectId, user);
      return respond(req, { ok: true });
    }
    if (path === "invite") {
      if (user.role !== "employer") {
        throw new DomainError(
          "FORBIDDEN",
          "Only the employer can invite members.",
        );
      }
      const value = z
        .object({
          email: z.email().max(254),
          name: z.string().trim().min(2).max(80),
          role: z.string().trim().min(2).max(80),
        })
        .strict()
        .parse(input);
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(
        (n) => n.toString(16).padStart(2, "0"),
      ).join("");
      checked(
        await admin().rpc("invite_workspace_member", {
          p_actor_id: user.id,
          p_id: uid(),
          p_email: value.email,
          p_name: value.name,
          p_role: value.role,
          p_hash: await tokenHash(token),
        }),
      );
      return respond(req, {
        url: `${origin ?? env("ALLOWED_ORIGIN")}/?join=${token}`,
      });
    }
    throw new HttpError(404, "NOT_FOUND", "Endpoint not found.");
  } catch (error) {
    return errorResponse(req, error);
  }
}
Deno.serve(handler);
