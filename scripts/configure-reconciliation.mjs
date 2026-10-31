// The server key stays in process memory and encrypted Supabase Vault storage.
import { projectClient } from "./project-client.mjs";
import { writeFileSync } from "node:fs";
const { admin, serviceKey } = projectClient();
const { data, error } = await admin.rpc("configure_reconciliation", {
  p_service_key: serviceKey,
});
if (error) {
  throw new Error(
    "Scheduler setup failed; review the existing job/Vault metadata. Secret values are withheld.",
  );
}
const response = await fetch(
  "https://tsnwowlyrlxpwwetmxns.supabase.co/functions/v1/reconcile",
  {
    method: "POST",
    headers: { apikey: serviceKey, "Content-Type": "application/json" },
    body: "{}",
  },
);
if (!response.ok) {
  throw new Error(
    "The reconciliation endpoint did not accept server authentication.",
  );
}
const result = await response.json();
if (result.failed !== 0) {
  throw new Error(
    "Reconciliation reports unfinished provider work. Inspect the private webhook inbox.",
  );
}
writeFileSync(
  new URL("../.supabase/scheduler-setup.json", import.meta.url),
  JSON.stringify(
    { jobId: data, verifiedAt: new Date().toISOString(), result },
    null,
    2,
  ),
);
console.log(
  "Configured one minute-based reconciliation job with Vault-protected authentication; the service endpoint passed its smoke test.",
);
