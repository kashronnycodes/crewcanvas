import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { projectClient, projectRef, projectUrl } from "./project-client.mjs";
export async function testSession(index = 0) {
  const fixtures = JSON.parse(
    readFileSync(
      new URL("../.supabase/integration-results.json", import.meta.url),
      "utf8",
    ),
  );
  if (fixtures.projectRef !== projectRef) {
    throw new Error("Unexpected test project.");
  }
  const account = fixtures.accounts[index];
  if (
    !/^crewcanvas\.(employer|freelancer|other)\.[0-9]+@example\.com$/.test(
      account?.email ?? "",
    )
  ) throw new Error("Only labeled integration-test accounts are allowed.");
  const { admin, publicKey } = projectClient();
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: account.email,
  });
  if (link.error) {
    throw new Error("Could not authenticate the labeled test account.");
  }
  const client = createClient(projectUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.data.properties.hashed_token,
  });
  if (signed.error || !signed.data.session) {
    throw new Error("Test-account session could not be established.");
  }
  const token = signed.data.session.access_token;
  return {
    fixtures,
    admin,
    client,
    async request(
      path,
      body,
      workspaceId = fixtures.workspaceId,
      id = randomUUID(),
    ) {
      const response = await fetch(
        `${projectUrl}/functions/v1/crew-api/${path}`,
        {
          method: body === undefined ? "GET" : "POST",
          signal: AbortSignal.timeout(90000),
          headers: {
            apikey: publicKey,
            Authorization: `Bearer ${token}`,
            "X-Workspace-Id": workspaceId,
            "Content-Type": "application/json",
            Origin: "http://127.0.0.1:5173",
            "Idempotency-Key": id,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(
          `${path}: ${data.error?.message ?? "Request failed"}`,
        );
        error.status = response.status;
        error.code = data.error?.code;
        throw error;
      }
      return data;
    },
    close: () => client.auth.signOut(),
  };
}
