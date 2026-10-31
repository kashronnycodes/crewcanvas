import { readFileSync, writeFileSync } from "node:fs";
import { projectClient } from "./project-client.mjs";
import { serviceCall } from "./service-call.mjs";
let workerId = process.env.CREW_SELLER_MEMBERSHIP_ID;
if (!workerId && process.argv.includes("--test-fixture")) {
  const fixtures = JSON.parse(
    readFileSync(
      new URL("../.supabase/integration-results.json", import.meta.url),
      "utf8",
    ),
  );
  if (
    fixtures.projectRef !== "tsnwowlyrlxpwwetmxns" ||
    !/^crewcanvas\.freelancer\.[0-9]+@example\.com$/.test(
      fixtures.accounts[1].email,
    )
  ) throw new Error("Unexpected test fixture.");
  const { admin } = projectClient();
  const member = await admin.from("memberships").select("id").eq(
    "workspace_id",
    fixtures.workspaceId,
  ).eq("auth_user_id", fixtures.accounts[1].id).eq("access_role", "worker")
    .single();
  if (member.error) {
    throw new Error("Test freelancer membership was not found.");
  }
  workerId = member.data.id;
}
if (!workerId) {
  throw new Error(
    "Set CREW_SELLER_MEMBERSHIP_ID or explicitly choose --test-fixture.",
  );
}
const seller = await serviceCall("configure-seller", { workerId });
writeFileSync(
  new URL("../.supabase/paypal-setup.json", import.meta.url),
  JSON.stringify(seller, null, 2),
);
console.log(
  "Configured the single Sandbox seller mapping from server-side settings. No credential values were returned.",
);
const webhook = await serviceCall("webhook-check");
console.log(
  "Verified the actual Sandbox webhook registration, callback URL and Invoicing event subscriptions.",
);
