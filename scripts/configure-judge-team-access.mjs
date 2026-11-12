// Operator-only setup. Judges use the deployed UI; no account or payment rows are changed.
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {randomBytes,createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
import {isDeepStrictEqual} from "node:util";
import {projectClient,projectRef} from "./project-client.mjs";
const workspaceId="b00f4462-5c6f-45ec-b1fb-a0d7c2895a72";
const emails=["crewcanvas.employer.1793461807178@example.com","crewcanvas.freelancer.1793461807178@example.com"];
const statePath=new URL("../.supabase/judge-team-access.local.json",import.meta.url);
const baselinePath=new URL("../.supabase/judge-team-baseline.local.json",import.meta.url);
const envPath=new URL("../.supabase/judge-team.env.local",import.meta.url);
const checked=r=>{if(r.error)throw new Error("Backend verification failed; provider output withheld.");return r.data;};
const {admin}=projectClient();
const fixture=JSON.parse(readFileSync(new URL("../.supabase/integration-results.json",import.meta.url),"utf8"));
assert.equal(fixture.workspaceId,workspaceId);assert.equal(fixture.projectRef,projectRef);
const accounts=fixture.accounts.slice(0,2);
const members=[];
for(let i=0;i<2;i++){
 assert.equal(accounts[i].email,emails[i]);
 const user=checked(await admin.auth.admin.getUserById(accounts[i].id));assert.equal(user.user.email,emails[i]);
 const membership=checked(await admin.from("memberships").select("id,access_role,data,auth_user_id").eq("workspace_id",workspaceId).eq("auth_user_id",accounts[i].id).single());
 assert.equal(membership.access_role,i===0?"employer":"worker");members.push(membership);
}
async function records(){
 const projects=checked(await admin.from("projects").select("*").eq("workspace_id",workspaceId).order("id"));
 const ids=projects.map(p=>p.id);
 const invoices=ids.length?checked(await admin.from("invoices").select("*").in("project_id",ids).order("id")):[];
 const seller=checked(await admin.rpc("provider_store",{p_action:"seller",p_payload:{workerId:members[1].id}}));assert.ok(seller);assert.equal(seller.environment,"sandbox");
 assert.ok(invoices.some(i=>i.data.state==="paid"&&String(i.paid_minor)==="500"&&String(i.amount_minor)==="500"),"Expected existing successful USD 5.00 Sandbox invoice");
 const memberships=checked(await admin.from("memberships").select("*").eq("workspace_id",workspaceId).order("id"));
 return {projects,invoices,seller,memberships};
}
const current=await records();
if(process.argv.includes("--verify")){
 const before=JSON.parse(readFileSync(baselinePath,"utf8"));
 // Normal scheduled PayPal reconciliation advances sync timestamps and aggregate
 // versions. Compare all saved content and payment amounts/states without them.
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).filter(([k])=>!["syncedAt","updated_at","version"].includes(k)).map(([k,v])=>[k,stable(v)])):value;
 assert.ok(isDeepStrictEqual(stable(current),stable(before)),"Saved content, seller mapping or payment data changed; investigate using the private baseline.");
 console.log("PASS saved payment-test content, memberships, connected Sandbox seller and invoice amounts/statuses preserved, including paid USD 5.00. Background provider sync metadata excluded.");
}else{
 if(!existsSync(baselinePath))writeFileSync(baselinePath,JSON.stringify(current,null,2));
 const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,"utf8")):{code:randomBytes(24).toString("base64url"),workspaceId,createdAt:new Date().toISOString()};
 assert.equal(state.workspaceId,workspaceId);writeFileSync(statePath,JSON.stringify(state,null,2));
 const digest=createHash("sha256").update(state.code).digest("hex");
 writeFileSync(envPath,["JUDGE_TEAM_ACCESS_ENABLED=true",`JUDGE_TEAM_ACCESS_CODE_SHA256=${digest}`,`JUDGE_TEAM_EMPLOYER_AUTH_ID=${accounts[0].id}`,`JUDGE_TEAM_FREELANCER_AUTH_ID=${accounts[1].id}`].join("\n")+"\n");
 writeFileSync(new URL("../.supabase/JUDGE-TEAM-TESTING.local.md",import.meta.url),`# Private CrewCanvas rehearsal instructions\n\nOpen https://crewcanvas.vercel.app in separate browser profiles (or two isolated browser contexts). One browser profile shares sessions across ordinary windows.\n\nUnder Judge/team access enter the private code stored in judge-team-access.local.json (field code), then choose Employer or Freelancer. Keep that file and the code out of recordings, screenshots, source control and public docs. Normal registration/sign-in remain separate. Refresh preserves the normal Auth session; Workspace menu → Sign out ends only this browser session.\n\nConnected workspace: Updated integration studio 1793461807178 (${workspaceId}). Shared accounts share data: create a new task titled Rehearsal + date/time + your initials. Do not reuse or edit paid verification tasks.\n\n1. Employer: create a task assigned to the existing connected freelancer and propose terms.\n2. Freelancer: accept the work/terms, then upload a file and submit it for review.\n3. Employer: inspect Files and previews; approve work and confirm Are you sure. Use Request revision for changes, then resubmit and approve the new version. Approval does not mark an invoice paid.\n4. Freelancer: issue the invoice using the existing connected PayPal Sandbox seller.\n5. Employer: manually open PayPal Sandbox checkout and pay with the separate Personal Sandbox buyer account supplied privately by the organizer. The CrewCanvas identities are not PayPal logins. Keep the buyer password out of UI, documents, screenshots and recordings. Do not use the Business seller as buyer.\n6. Return to CrewCanvas and refresh/check payment until the real provider reconciliation shows Paid. Never fabricate a success or reset the connected merchant. Preserve the existing successful USD 5.00 invoice.\n\nTo disable access, set JUDGE_TEAM_ACCESS_ENABLED=false on the backend. This stops new judge logins; normal authenticated sessions retain their standard expiry/permissions. Rotate the private code by generating a new random value locally and updating only its SHA-256 backend digest.\n`);
 if(process.argv.includes("--set-secrets")){
  try{execFileSync(process.platform==="win32"?"npx.cmd":"npx",["--yes","supabase@2.122.0","secrets","set","--env-file",".supabase/judge-team.env.local","--project-ref",projectRef],{shell:process.platform==="win32",encoding:"utf8",env:process.env,stdio:["ignore","pipe","pipe"]});}catch{throw new Error("Secret configuration failed; command output withheld to protect credentials.");}
  console.log("PASS judge/team backend configuration saved. Secret values were not printed.");
 }else console.log("PASS fixed existing accounts and paid USD 5.00 verified. Private code, backend env file and rehearsal guide saved locally.");
}
