import {beforeEach,afterEach,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({setSession:vi.fn()}));
vi.mock("../src/services",()=>({supabase:{auth:{setSession:mocks.setSession}}}));
import {signInJudge} from "../src/judgeAccounts";
beforeEach(()=>{sessionStorage.clear();vi.clearAllMocks();});
afterEach(()=>vi.unstubAllGlobals());
it("sends only the role and code, stores a normal session and workspace preference",async()=>{
 const fetch=vi.fn().mockResolvedValue(Response.json({session:{access_token:"test-access",refresh_token:"test-refresh"},workspaceId:"test-workspace"}));vi.stubGlobal("fetch",fetch);
 mocks.setSession.mockResolvedValue({data:{user:{id:"test-user"}},error:null});
 await signInJudge("employer","private-test-code");
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({role:"employer",code:"private-test-code"});
 expect(fetch.mock.calls[0][1].cache).toBe("no-store");
 expect(mocks.setSession).toHaveBeenCalledWith({access_token:"test-access",refresh_token:"test-refresh"});
 expect(sessionStorage.getItem("crewcanvas.workspace.test-user")).toBe("test-workspace");
});
it("never installs a session after invalid-code or throttling responses",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({message:"Incorrect code"},{status:401})));
 await expect(signInJudge("freelancer","wrong-code")).rejects.toThrow("Incorrect code");expect(mocks.setSession).not.toHaveBeenCalled();
});
