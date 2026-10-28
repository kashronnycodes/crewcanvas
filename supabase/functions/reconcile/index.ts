import {
  admin,
  env,
  errorResponse,
  HttpError,
  loadProject,
  providerStore,
  respond,
} from "../_shared/backend.ts";
import { processWebhookEvent, reconcileProject } from "../_shared/paypal.ts";
export async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST")
      throw new HttpError(405, "METHOD", "POST required.");
    if (req.headers.get("apikey") !== env("SUPABASE_SERVICE_ROLE_KEY"))
      throw new HttpError(
        401,
        "UNAUTHENTICATED",
        "Service authentication required.",
      );
    const pending = await providerStore("webhook_pending");
    let processed = 0;
    let failed = 0;
    for (const event of pending ?? [])
      try {
        await processWebhookEvent(event);
        processed++;
      } catch (error) {
        failed++;
        await providerStore("webhook_error", {
          eventId: event.event_id,
          error:
            error instanceof Error ? error.message : "Reconciliation failed",
        });
      }
    const rows = await admin()
      .from("invoices")
      .select("project_id")
      .not("provider_id", "is", null)
      .order("id")
      .limit(200);
    if (rows.error) throw rows.error;
    for (const projectId of new Set(
      (rows.data ?? []).map((row) => row.project_id),
    ))
      try {
        const p = await loadProject(projectId);
        await reconcileProject(p.id, {
          id: p.workerId,
          role: "worker",
          workspaceId: p.workspaceId,
        });
      } catch (error) {
        failed++;
        console.error(
          "Scheduled reconciliation failed",
          projectId,
          error instanceof Error ? error.message : "unknown",
        );
      }
    return respond(req, { processed, failed });
  } catch (error) {
    return errorResponse(req, error);
  }
}
Deno.serve(handler);
