// @vitest-environment node
import {beforeEach,it,expect,vi} from "vitest";
import {judgeIdentities,judgeWorkspaceId,sha256} from "../shared/judge-access";
const m=vi.hoisted(()=>({env:{} as Record<string,string>,rpc:vi.fn(),getUser:vi.fn(),link:vi.fn(),verify:vi.fn(),member:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({rpc:m.rpc,auth:{admin:{getUserById:m.getUser,generateLink:m.link},verifyOtp:m.verify},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:m.member};return q;}})}));
vi.stubGlobal("Deno",{env:{get:(name:string)=>m.env[name]},serve:vi.fn()});
const entry="../supabase/functions/judge-team-access/index.ts";
const {handler}=await import(entry);
const code="private-synthetic-test-code";
function request(body:unknown,origin="https://crewcanvas.test"){return new Request("https://api.test/judge-team-access",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json","x-forwarded-for":"192.0.2.1"},body:JSON.stringify(body)});}
beforeEach(async()=>{
 vi.clearAllMocks();m.env={ALLOWED_ORIGIN:"https://crewcanvas.test",JUDGE_TEAM_ACCESS_ENABLED:"true",JUDGE_TEAM_ACCESS_CODE_SHA256:await sha256(code),JUDGE_TEAM_EMPLOYER_AUTH_ID:"auth-employer",JUDGE_TEAM_FREELANCER_AUTH_ID:"auth-freelancer",SUPABASE_URL:"https://api.test",SUPABASE_SERVICE_ROLE_KEY:"test-private-service",SUPABASE_ANON_KEY:"test-public"};
 m.rpc.mockResolvedValue({data:true});m.member.mockResolvedValue({data:{id:"member"}});
 m.getUser.mockImplementation(async(id:string)=>({data:{user:{id,email:judgeIdentities[id==="auth-employer"?"employer":"freelancer"]}}}));
 m.link.mockImplementation(async({email}:{email:string})=>({data:{user:{id:email===judgeIdentities.employer?"auth-employer":"auth-freelancer"},properties:{hashed_token:"server-only-token-hash"}}}));
 m.verify.mockResolvedValue({data:{session:{user:{id:"auth-employer"},access_token:"test-access",refresh_token:"test-refresh"}}});
});
it.each(["employer","freelancer"])("establishes a genuine fixed %s session without exposing login links",async(role)=>{
 m.verify.mockResolvedValue({data:{session:{user:{id:`auth-${role}`},access_token:"test-access",refresh_token:"test-refresh"}}});
 const r=await handler(request({role,code}));expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toBe("no-store");
 const body=await r.json();expect(body).toEqual({workspaceId:judgeWorkspaceId,session:{access_token:"test-access",refresh_token:"test-refresh"}});
 expect(m.link).toHaveBeenCalledWith({type:"magiclink",email:judgeIdentities[role as keyof typeof judgeIdentities]});
 expect(JSON.stringify(body)).not.toMatch(/server-only|test-private/);
});
it("rejects arbitrary identities and incorrect codes before generating links",async()=>{
 for(const body of [{role:"owner",code},{role:"employer",code,email:"other@example.com"},{role:"freelancer",code,userId:"other"},{role:"employer",code:"bad"}])expect((await handler(request(body))).status).toBeGreaterThanOrEqual(400);
 expect(m.link).not.toHaveBeenCalled();expect(m.verify).not.toHaveBeenCalled();
});
it("fails closed for disabled, missing configuration, unavailable admission and throttling",async()=>{
 m.env.JUDGE_TEAM_ACCESS_ENABLED="false";expect((await handler(request({role:"employer",code}))).status).toBe(503);expect(m.rpc).not.toHaveBeenCalled();
 m.env.JUDGE_TEAM_ACCESS_ENABLED="true";m.rpc.mockResolvedValueOnce({error:{}});expect((await handler(request({role:"employer",code}))).status).toBe(503);
 m.rpc.mockResolvedValueOnce({data:false});const limited=await handler(request({role:"employer",code}));expect(limited.status).toBe(429);expect(limited.headers.get("Retry-After")).toBe("60");
 expect(m.link).not.toHaveBeenCalled();
});
it("verifies membership and account identity and rejects unknown browser origins",async()=>{
 expect((await handler(request({role:"employer",code},"https://evil.test"))).status).toBe(403);expect(m.rpc).not.toHaveBeenCalled();
 m.member.mockResolvedValueOnce({data:null});expect((await handler(request({role:"employer",code}))).status).toBe(503);
 m.getUser.mockResolvedValueOnce({data:{user:{email:"other@example.com"}}});expect((await handler(request({role:"employer",code}))).status).toBe(503);expect(m.link).not.toHaveBeenCalled();
});
