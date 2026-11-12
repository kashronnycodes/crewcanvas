import fs from "node:fs";
import {memberTaskRoster} from "../shared/member-tasks";
import { test as base, expect, type Page } from "@playwright/test";
import { seedWorkspace, IDS } from "../shared/seed";
import { execute, makeAgreement } from "../shared/domain";
import { visibleWorkflow } from "../shared/workflow";
import type { WorkspaceSnapshot } from "../shared/types";
// HTTP test doubles exercise the production auth/API route; no app demo mode exists.
export const test = base.extend<{ backend: { snapshot: WorkspaceSnapshot; boards: any[]; requests: string[]; worker: () => Promise<void>; owner: () => Promise<void> } }>({
 backend: async ({ page }, use) => {
  let s=seedWorkspace(); s.name="Launch team";
  s.projects=s.projects.slice(0,1); s.projects[0].title="Launch video"; s.projects[0].origin="sandbox";
  s.projects[0].invoices=[]; s.projects[0].revisions=[]; s.projects[0].proposals=[];
  s.people=s.people.filter(p=>p.id===IDS.myron||p.id===IDS.ava);
  s.people[0].name="Morgan Lee"; s.people[1].name="Alex Reyes"; s.people[1].role="Designer";
  s.layout={...s.layout,workflow:[{id:s.id,title:"Product launch",roles:[{id:IDS.ava,name:"Designer",members:[IDS.ava]}]}]};
  const boards: any[]=[]; const requests:string[]=[];
  let worker=false;
  const authId="60000000-0000-4000-8000-000000000001";
  await page.addInitScript(({authId})=>{
   const token=btoa(JSON.stringify({alg:"none"}))+"."+btoa(JSON.stringify({sub:authId,exp:Math.floor(Date.now()/1000)+3600}))+".synthetic";
   localStorage.setItem("sb-rate-test-auth-token",JSON.stringify({access_token:token,refresh_token:"synthetic",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:"bearer",user:{id:authId,email:"qa@example.com"}}));
  },{authId});
  await page.route("https://rate-test.supabase.co/**",async route=>{
   const u=new URL(route.request().url()); const path=u.pathname.split("/crew-api/")[1];
   requests.push(u.pathname);
   let body:any; try {body=route.request().postDataJSON();}catch{}
   if(u.pathname.endsWith("/settings")) return route.fulfill({json:{disable_signup:true}});
   if(u.pathname.includes("/auth/")) return route.fulfill({json:{}});
   if(path==="workspaces") return route.fulfill({json:[{id:s.actorId,workspace_id:s.id,access_role:worker?"worker":"employer",workspaces:{id:s.id,name:s.name,timezone:s.timezone}}]});
   if(path==="roster/summaries"&&worker)return route.fulfill({status:403,json:{error:{message:"Only the project owner can monitor tasks."}}});
   if(path==="roster/summaries") return route.fulfill({json:memberTaskRoster({id:worker?IDS.ava:IDS.myron,role:worker?"worker":"employer",workspaceId:s.id},s.people,s.projects,s.layout.workflow??[],s.name)});
   if(path==="snapshot") {
    const visible=structuredClone(s);
    if(worker){visible.files=visible.files?.filter(f=>visible.projects.some(t=>t.workerId===IDS.ava&&t.id===f.projectId));visible.actorId=IDS.ava;visible.people=visible.people.filter(p=>p.id===IDS.ava);visible.projects=visible.projects.filter(p=>p.workerId===IDS.ava);visible.layout.workflow=visibleWorkflow(visible.layout.workflow??[],visible.projects,IDS.ava);}
    return route.fulfill({json:visible});
   }
   if(path?.startsWith("members/") || path==="workspaces/update") {
    if(worker) return route.fulfill({status:403,json:{error:{message:"Only the employer can manage team members."}}});
    if(path==="workspaces/update"){s.name=body.name;s.timezone=body.timezone;return route.fulfill({json:{ok:true}});}
    if(path==="members/create") {
     if(!body.name?.trim()||!body.role?.trim()||!body.email?.includes("@"))return route.fulfill({status:400,json:{error:{message:"Invalid member."}}});
     if(s.people.some(p=>p.email.toLowerCase()===body.email.toLowerCase()))return route.fulfill({status:409,json:{error:{message:"A member with this email already exists in this workspace."}}});
     s.people.push({id:route.request().headers()["idempotency-key"],name:body.name,email:body.email,role:body.role,initials:body.name.slice(0,2),accessRole:"worker",color:"#cbd2e8",connected:false});
    } else {const person=s.people.find(p=>p.id===body.id&&p.accessRole==="worker");if(!person)return route.fulfill({status:404,json:{error:{message:"Member not found."}}});person.name=body.name;person.role=body.role;}
    return route.fulfill({json:{ok:true}});
   }
   if(path==="layout"){s.layout={...body,version:s.layout.version+1};return route.fulfill({json:s.layout});}
   if(u.pathname.endsWith("/projects")&&route.request().method()==="GET"){const id=u.searchParams.get("id")?.replace("eq.","");return route.fulfill({json:s.projects.filter(p=>(!worker||p.workerId===IDS.ava)&&(!id||p.id===id)).map(p=>({id:p.id}))});}
   if(path==="command") {
    if(body.type==="createProject"&&worker)return route.fulfill({status:403,json:{error:{message:"Only the project owner can create tasks."}}});
    if(body.type==="createProject"){
     const agreement=makeAgreement(body.terms,IDS.myron,null); agreement.status=body.workerId && !s.people.find(p=>p.id===body.workerId)?.sample && body.publish?"proposed":"draft";
     s.projects.push({...structuredClone(s.projects[0]),id:crypto.randomUUID(),title:body.title,workerId:body.workerId,organization:body.organization,state:"awaiting_agreement",activeAgreementId:null,agreements:[agreement],deliveries:[],revisions:[],proposals:[],invoices:[],activity:[],version:0});
    } else {const i=s.projects.findIndex(p=>p.id===body.projectId);if(i<0||worker&&s.projects[i].workerId!==IDS.ava)return route.fulfill({status:403,json:{error:{message:"This task is not available to your account."}}});s.projects[i]=execute(s.projects[i],body,{id:worker?IDS.ava:IDS.myron,role:worker?"worker":"employer",workspaceId:s.id});}
    return route.fulfill({json:{ok:true}});
   }
   if(path==="files/upload") {
    const request=route.request();
    const form=await new Request(u,{method:"POST",headers:{"Content-Type":request.headers()["content-type"]},body:request.postDataBuffer()!}).formData();
    const file=form.get("file") as File;
    const id=String(form.get("id")); const now=new Date().toISOString();
    const item={id,workspaceId:s.id,projectId:String(form.get("projectId")),purpose:form.get("purpose") as "revision_reference"|undefined,uploadedBy:worker?IDS.ava:IDS.myron,name:file.name,mime:file.type,size:file.size,x:0,y:0,version:1,versions:[{path:id,name:file.name,mime:file.type,size:file.size,createdAt:now}],createdAt:now,updatedAt:now};
    s.files??=[];s.files.push(item);
    return route.fulfill({json:item});
   }
   if(path==="files/url") return route.fulfill({json:{url:"https://rate-test.supabase.co/test-image.png"}});
   if(u.pathname==="/test-image.png") return route.fulfill({contentType:"image/png",body:fs.readFileSync(new URL("./fixtures/color-reference.png",import.meta.url))});
   if(path?.startsWith("ai/")) return route.fulfill({status:503,json:{error:{message:"AI is unavailable. Try again."}}});
   if(u.pathname.endsWith("/board_objects")){
    if(route.request().method()==="GET")return route.fulfill({json:boards});
    const id=body.id??u.searchParams.get("id")?.replace("eq.","");const index=boards.findIndex(b=>b.id===id);
    const row={...(boards[index]??{}),...body,id,version:body.version??1,author_id:IDS.myron,updated_by:IDS.myron,updated_at:new Date().toISOString()};
    if(index<0)boards.push(row);else boards[index]=row;
    return route.fulfill({json:row});
   }
   if(u.pathname.endsWith("/board_comments"))return route.fulfill({json:[]});
   return route.fulfill({json:{ok:true}});
  });
  await use({get snapshot(){return s;},boards,requests,worker:async()=>{worker=true;await page.reload();},owner:async()=>{worker=false;await page.reload();}});
 },
});
export { expect };
export async function openRole(page:Page) {
 const mobile=(page.viewportSize()?.width??1280)<760;
 if(mobile)await page.getByLabel("Open role Designer",{exact:true}).click();
 else await page.locator(".hierarchy-role").getByRole("button",{name:"Designer",exact:true}).click();
}

export async function openTask(page:Page,title="Launch video"){
 await page.getByRole("heading",{name:/^(My Tasks|Project Studio)$/}).waitFor();
 if(await page.locator(".worker-drawer").count()){
  const picker=page.locator("#project-select");
  if(await picker.count())await picker.selectOption({label:title});
  await expect(page.locator(".task-page-title")).toHaveText(title);return;
 }
 if(await page.getByRole("heading",{name:"My Tasks",exact:true}).count()){
  await page.getByRole("region",{name:"My Tasks",exact:true}).getByRole("button",{name:title,exact:true}).click();
 }else{
  await page.getByLabel("Task whiteboard",{exact:true}).selectOption({label:title});
  await page.locator(".project-board .board-context").getByRole("button",{name:"Task details",exact:true}).click();
 }
 await expect(page.getByRole("region",{name:"Task details",exact:true})).toBeVisible();
}
