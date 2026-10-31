import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const projectRef = "tsnwowlyrlxpwwetmxns";
export const projectUrl = `https://${projectRef}.supabase.co`;
// Only this process changes environment. Never switch the user's global CLI identity.
process.env.SUPABASE_HOME = fileURLToPath(
  new URL("../.supabase/cli-state", import.meta.url),
);
process.env.SUPABASE_PROFILE = fileURLToPath(
  new URL("../.supabase/crewcanvas-profile.yaml", import.meta.url),
);
delete process.env.SUPABASE_ACCESS_TOKEN;
function cliJSON(args) {
  // Arguments here are fixed developer-owned strings, never user input or credentials.
  try {
    return JSON.parse(
      execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", [
        "--yes",
        "supabase@2.122.0",
        ...args,
      ], {
        encoding: "utf8",
        shell: process.platform === "win32",
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    throw new Error(
      "The isolated Supabase CLI request failed. Verify the CrewCanvas login; command output is withheld to protect credentials.",
    );
  }
}
export function projectClient() {
  const identity = cliJSON(["whoami", "--output-format", "json"]);
  if (identity.email !== "ronnybraces@gmail.com") {
    throw new Error(
      "Expected isolated ronnybraces account. Operation refused.",
    );
  }
  const keys = cliJSON([
    "projects",
    "api-keys",
    "--project-ref",
    projectRef,
    "--reveal",
    "--output",
    "json",
  ]);
  const publicKey = (keys.find((k) => k.type === "publishable") ??
    keys.find((k) => k.name === "anon"))?.api_key;
  const serviceKey = keys.find((k) => k.name === "service_role")?.api_key;
  if (!publicKey || !serviceKey) {
    throw new Error(
      "Project keys unavailable. No credentials will be printed.",
    );
  }
  return {
    publicKey,
    admin: createClient(projectUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}
