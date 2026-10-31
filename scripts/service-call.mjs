import { projectClient, projectUrl } from "./project-client.mjs";
export async function serviceCall(operation, body = {}) {
  if (!["ai-probe", "configure-seller", "webhook-check", "webhook-events"].includes(operation)) {
    throw new Error("Unsupported administrative operation.");
  }
  const { serviceKey } = projectClient();
  const response = await fetch(
    `${projectUrl}/functions/v1/reconcile/${operation}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: { apikey: serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Administrative operation failed.");
  }
  return data;
}
