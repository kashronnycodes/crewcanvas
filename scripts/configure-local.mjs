import { writeFileSync } from "node:fs";
import { projectClient, projectUrl } from "./project-client.mjs";
const { publicKey } = projectClient();
writeFileSync(
  new URL("../.env.local", import.meta.url),
  `VITE_APP_MODE=integrated\nVITE_SUPABASE_URL=${projectUrl}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publicKey}\n`,
);
console.log(
  "Configured ignored .env.local with the project URL and browser publishable key only.",
);
