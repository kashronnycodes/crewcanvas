// Public frontend settings only; server/provider credentials never go to Vercel.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { projectClient, projectUrl } from "./project-client.mjs";
const project = JSON.parse(readFileSync(new URL("../.vercel/project.json", import.meta.url), "utf8"));
if (project.projectId !== "prj_S3Vfd7Joh1sOB6zRK09bj8XJnMg5" || project.orgId !== "team_qNOuwpfIbmBWuSpmPKuVtN5E") {
  throw new Error("Unexpected Vercel target. Configuration refused.");
}
const { publicKey } = projectClient();
const settings = { VITE_APP_MODE: "integrated", VITE_SUPABASE_URL: projectUrl, VITE_SUPABASE_PUBLISHABLE_KEY: publicKey };
for (const [name, value] of Object.entries(settings)) {
  try {
    // Values use stdin, never shell interpolation. Command arguments are fixed.
    execFileSync(process.platform === "win32" ? "vercel.cmd" : "vercel", ["env", "add", name, "production", "--yes", "--force", "--no-sensitive"], {
      shell: process.platform === "win32", input: value, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
  } catch { throw new Error(`Could not configure ${name}. CLI output withheld.`); }
  console.log(`Configured production ${name}; value withheld.`);
}
