// Administrative provider setup is callable only after requireService succeeds.
import { z } from "zod";
import OpenAI from "npm:openai@6.15.0";
import {
  admin,
  body,
  env,
  HttpError,
  providerStore,
  respond,
} from "./backend.ts";
import { paypal } from "./paypal.ts";
export async function serviceOperation(req: Request): Promise<Response | null> {
  const path = new URL(req.url).pathname.split("/reconcile/")[1] ?? "";
  if (!path) return null;
  if (path === "ai-probe") {
    z.object({}).strict().parse(await body(req));
    const client = new OpenAI({
      apiKey: env("OPENAI_API_KEY"),
      timeout: 20000,
      maxRetries: 0,
    });
    try {
      const result = await client.responses.create({
        model: Deno.env.get("OPENAI_MODEL") ?? "gpt-6-astra",
        store: false,
        input: "Synthetic diagnostic: reply with OK.",
        max_output_tokens: 64,
      });
      return respond(req, {
        ok: true,
        model: result.model,
        responseStatus: result.status,
      });
    } catch (error) {
      const e = error as {
        status?: number;
        code?: unknown;
        type?: unknown;
        error?: { code?: unknown; type?: unknown };
        headers?: { get: (name: string) => string | null };
      };
      const safe = (value: unknown) =>
        typeof value === "string" && /^[a-z][a-z0-9_]{0,48}$/.test(value)
          ? value
          : null;
      const seconds = e.headers?.get?.("retry-after");
      return respond(req, {
        ok: false,
        providerStatus: e.status ?? null,
        providerCode: safe(e.code ?? e.error?.code),
        providerType: safe(e.type ?? e.error?.type),
        retryAfterSeconds: seconds && /^\d{1,6}$/.test(seconds)
          ? Number(seconds)
          : null,
      });
    }
  }
  if (path === "configure-seller") {
    const { workerId } = z.object({ workerId: z.uuid() }).strict().parse(
      await body(req),
    );
    const merchantId = z.string().trim().min(5).max(80).parse(
      env("PAYPAL_MERCHANT_ID"),
    );
    const email = z.email().parse(env("PAYPAL_SELLER_EMAIL"));
    const member = await admin().from("memberships").select(
      "id,workspace_id,access_role",
    ).eq("id", workerId).eq("access_role", "worker").single();
    if (member.error || !member.data) {
      throw new HttpError(
        400,
        "VALIDATION",
        "Choose an existing freelancer membership.",
      );
    }
    const prior = await providerStore("seller", { workerId });
    if (
      prior &&
      (prior.merchant_id !== merchantId ||
        prior.email.toLowerCase() !== email.toLowerCase())
    ) {
      throw new HttpError(
        409,
        "CONFLICT",
        "Existing seller differs; review the mapping before changing it.",
      );
    }
    const configured = await admin().rpc("configured_sandbox_seller", {
      p_merchant_id: merchantId,
      p_email: email,
    });
    if (configured.error) {
      throw new HttpError(503, "SELLER_CONFIG", "Could not verify the existing seller mapping.");
    }
    if (configured.data && configured.data !== prior?.id) {
      throw new HttpError(
        409,
        "CONFLICT",
        "The Sandbox seller is already mapped to a different membership.",
      );
    }
    const id = prior?.id ?? crypto.randomUUID();
    await providerStore("configure_seller", {
      id,
      workspaceId: member.data.workspace_id,
      workerId,
      merchantId,
      email,
    });
    return respond(req, {
      sellerConnectionId: id,
      workerId,
      workspaceId: member.data.workspace_id,
      environment: "sandbox",
    });
  }
  if (path === "webhook-check") {
    z.object({}).strict().parse(await body(req));
    const webhookId = env("PAYPAL_WEBHOOK_ID");
    const list = await paypal("/v1/notifications/webhooks");
    const hook = (list.webhooks ?? []).find((hook: { id: string }) =>
      hook.id === webhookId
    );
    const expected = env("SUPABASE_URL").replace(/\/$/, "") +
      "/functions/v1/paypal-webhook";
    const required = [
      "INVOICING.INVOICE.CREATED",
      "INVOICING.INVOICE.UPDATED",
      "INVOICING.INVOICE.PAID",
      "INVOICING.INVOICE.CANCELLED",
      "INVOICING.INVOICE.REFUNDED",
    ];
    const names = (hook?.event_types ?? []).map((e: { name: string }) =>
      e.name
    );
    if (
      !hook || hook.url !== expected ||
      !names.includes("*") && required.some((name) => !names.includes(name))
    ) {
      throw new HttpError(
        409,
        "WEBHOOK_CONFIG",
        "Register the exact CrewCanvas webhook URL and required Invoicing events in the same Sandbox REST app.",
      );
    }
    return respond(req, {
      registered: true,
      urlMatches: true,
      eventTypesMatch: true,
      environment: "sandbox",
    });
  }
  throw new HttpError(404, "NOT_FOUND", "Service operation not found.");
}
