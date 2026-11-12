import {supabase} from "./services";
import type {JudgeRole} from "../shared/judge-access";
export type {JudgeRole};
export async function signInJudge(role:JudgeRole,code:string):Promise<void>{
  if(!supabase)throw new Error("Cannot connect to CrewCanvas.");
  let response:Response;
  try{response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/judge-team-access`,{
    method:"POST",headers:{"Content-Type":"application/json",apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({role,code}),cache:"no-store",signal:AbortSignal.timeout(20000),
  });}catch{throw new Error("Could not connect. Check your connection and try again.");}
  const result=await response.json();
  if(!response.ok)throw new Error(typeof result.message==="string"?result.message:"Judge/team sign-in failed.");
  if(!result.session?.access_token||!result.session?.refresh_token||typeof result.workspaceId!=="string")throw new Error("The sign-in response was incomplete. Please try again.");
  const signed=await supabase.auth.setSession(result.session);
  if(signed.error)throw signed.error;
  if(!signed.data.user)throw new Error("Could not restore the testing session.");
  sessionStorage.setItem(`crewcanvas.workspace.${signed.data.user.id}`,result.workspaceId);
}
