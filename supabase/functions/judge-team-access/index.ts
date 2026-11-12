import {createClient} from "npm:@supabase/supabase-js@2.80.0";
import {admin,allowedOrigins,env,headers} from "../_shared/backend.ts";
import {judgeCodeMatches,judgeIdentities,judgeRequest,judgeWorkspaceId,sha256} from "../../../shared/judge-access.ts";

// This is the only public authentication entry point. No client-supplied identity.
export async function handler(req:Request):Promise<Response>{
  const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers(req),"Cache-Control":"no-store","Pragma":"no-cache",...(status===429?{"Retry-After":"60"}:{})}});
  const origin=req.headers.get("Origin");
  if(origin&&!allowedOrigins().includes(origin))return reply({message:"This browser origin is not permitted."},403);
  if(req.method==="OPTIONS")return reply({});
  if(req.method!=="POST")return reply({message:"Method not allowed."},405);
  const digest=Deno.env.get("JUDGE_TEAM_ACCESS_CODE_SHA256")??"";
  if(Deno.env.get("JUDGE_TEAM_ACCESS_ENABLED")!=="true"||!/^[a-f0-9]{64}$/.test(digest))return reply({message:"Judge/team access is currently unavailable. Use normal sign-in."},503);
  try{
    const client=admin();
    // Hash network identifiers with the private code digest; store no raw IP.
    const ip=(req.headers.get("x-forwarded-for")??req.headers.get("cf-connecting-ip")??"unknown").split(",")[0].trim().slice(0,100);
    const admission=await client.rpc("judge_access_admit",{p_fingerprint:await sha256(digest+":"+ip)});
    if(admission.error)return reply({message:"Access protection is unavailable. Try again shortly."},503);
    if(admission.data!==true)return reply({message:"Too many access attempts. Try again in a minute."},429);
    if(Number(req.headers.get("Content-Length")??0)>2048)return reply({message:"Invalid access request."},400);
    const text=await req.text();
    if(text.length>2048)return reply({message:"Invalid access request."},400);
    let input;try{input=judgeRequest.safeParse(JSON.parse(text));}catch{return reply({message:"Invalid access request."},400);}
    if(!input.success)return reply({message:"Invalid access request."},400);
    if(!await judgeCodeMatches(input.data.code,digest))return reply({message:"The judge/team code is incorrect."},401);
    const role=input.data.role;
    const authId=Deno.env.get(role==="employer"?"JUDGE_TEAM_EMPLOYER_AUTH_ID":"JUDGE_TEAM_FREELANCER_AUTH_ID");
    if(!authId)return reply({message:"Judge/team access is not configured."},503);
    const account=await client.auth.admin.getUserById(authId);
    const membership=await client.from("memberships").select("id,access_role").eq("auth_user_id",authId).eq("workspace_id",judgeWorkspaceId).eq("access_role",role==="employer"?"employer":"worker").maybeSingle();
    if(account.error||account.data.user?.email!==judgeIdentities[role]||membership.error||!membership.data)return reply({message:"The testing account is unavailable. Contact the organizer."},503);
    const link=await client.auth.admin.generateLink({type:"magiclink",email:judgeIdentities[role]});
    if(link.error||link.data.user?.id!==authId||!link.data.properties?.hashed_token)return reply({message:"Unable to establish a testing session. Try again shortly."},503);
    const auth=createClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const verified=await auth.auth.verifyOtp({type:"magiclink",token_hash:link.data.properties.hashed_token});
    const session=verified.data.session;
    if(verified.error||!session||session.user.id!==authId)return reply({message:"Unable to establish a testing session. Try again shortly."},503);
    // Normal Auth tokens, delivered over HTTPS in a non-cacheable response; never URLs/logs.
    return reply({session:{access_token:session.access_token,refresh_token:session.refresh_token},workspaceId:judgeWorkspaceId});
  }catch{
    // SDK/provider errors can contain credential-bearing URLs. Never log them.
    return reply({message:"Judge/team access is temporarily unavailable. Try again shortly."},503);
  }
}
Deno.serve(handler);
