// Run through: vercel env run -e production -- node scripts/verify-production-env.mjs
import assert from "node:assert/strict";
import { projectClient, projectUrl } from "./project-client.mjs";
const { publicKey } = projectClient();
const values = process.env;
assert.equal(values.VITE_APP_MODE, "integrated", "Production must use integrated mode");
assert.equal(values.VITE_SUPABASE_URL, projectUrl, "Unexpected production Supabase project");
assert.equal(values.VITE_SUPABASE_PUBLISHABLE_KEY, publicKey, "Production public key does not match the verified project");
const allowed = new Set(["VITE_APP_MODE", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
const unexpected = Object.keys(values).filter((key) => key.startsWith("VITE_") && !allowed.has(key));
assert.equal(unexpected.length, 0, "Review unexpected public frontend environment variables");
for (const name of ["GEMINI_API_KEY", "OPENAI_API_KEY", "PAYPAL_CLIENT_SECRET", "SUPABASE_SERVICE_ROLE_KEY"]) {
  assert.ok(!values[name], `${name} must remain in Supabase, not the frontend build environment`);
}
console.log("PASS production environment: integrated mode, exact project URL and matching publishable key; no provider/service credentials exposed to the build.");
