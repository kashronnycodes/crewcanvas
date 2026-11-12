import fs from "node:fs";
import { test, expect, openRole, openTask } from "./backend-fixture";
import { newBoardData } from "../shared/board";

const png=fs.readFileSync(new URL("./fixtures/color-reference.png",import.meta.url));
test("member files are primary, menus retain features and restricted reassignment explains on attempt",async({page,backend})=>{
 const task=backend.snapshot.projects[0];
 const now=new Date().toISOString();
 backend.snapshot.files=[{id:crypto.randomUUID(),workspaceId:backend.snapshot.id,projectId:task.id,uploadedBy:backend.snapshot.actorId,name:"Launch artwork.png",mime:"image/png",size:png.length,x:0,y:0,version:1,versions:[{path:"art.png",name:"Launch artwork.png",mime:"image/png",size:png.length,createdAt:now}],createdAt:now,updatedAt:now}];
 await page.goto("/");await openTask(page);
 const drawer=page.locator(".worker-drawer");
 await expect(drawer.getByRole("combobox",{name:"Member panel view"})).toHaveCount(0);
 expect(await drawer.locator("[data-task-section]").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("aria-label")))).toEqual(["Task details","Files and previews","Revisions","Payments","Activity"]);
 await expect(drawer.locator("#project-select")).toHaveCount(0);
 await expect(drawer.getByRole("tablist")).toHaveCount(0);
 await expect(drawer.getByText(/This task has agreed work/)).toHaveCount(0);
 await drawer.getByRole("button",{name:/Launch artwork.png/}).click();
 await expect(page.getByRole("dialog",{name:"Launch artwork.png",exact:true}).getByRole("img",{name:"Launch artwork.png"})).toBeVisible();
 await page.getByRole("button",{name:"Close dialog",exact:true}).click();


 await drawer.getByRole("combobox",{name:"Task assignee"}).selectOption("");
 await expect(drawer.getByRole("alert")).toContainText("agreed work or payment history");
 expect(backend.snapshot.projects[0].workerId).toBe(task.workerId);

 fs.mkdirSync("docs/evidence/member-files",{recursive:true});
 if(!test.info().project.name.includes("Mobile"))await drawer.screenshot({path:"docs/evidence/member-files/member-panel.png"});
 await drawer.getByRole("button",{name:"← Back",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Project Studio",exact:true})).toBeVisible();
 await expect(page.getByText("Duplicate as draft",{exact:true})).toHaveCount(0);
});

test("reference images choose, drop, remove, preview and persist only on their task revision",async({page,backend})=>{
 if(!test.info().project.name.includes("Mobile"))await page.setViewportSize({width:1440,height:1440});
 const task=backend.snapshot.projects[0];task.state="submitted";
 task.deliveries=[{id:crypto.randomUUID(),agreementId:task.activeAgreementId!,url:"https://example.com/work",label:"First delivery",note:"",submittedAt:new Date().toISOString(),status:"submitted"}];
 await page.goto("/");await openTask(page);

 await page.getByRole("button",{name:"Request revision",exact:true}).click();
 const picker=page.getByRole("region",{name:"Revision reference images",exact:true});
 await picker.getByLabel("Choose revision reference images").setInputFiles([{name:"Remove me.png",mimeType:"image/png",buffer:png},{name:"Color direction.png",mimeType:"image/png",buffer:png}]);
 await picker.getByRole("button",{name:"Remove reference Remove me.png"}).click();
 const transfer=await page.evaluateHandle(bytes=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(bytes)],"Layout reference.png",{type:"image/png"}));return data;},[...png]);
 await picker.getByRole("button",{name:/Drop reference images/}).dispatchEvent("drop",{dataTransfer:transfer});
 await picker.getByRole("img",{name:"Preview Color direction.png"}).click();
 await expect(page.getByRole("dialog",{name:"Color direction.png",exact:true}).getByRole("img")).toBeVisible();
 await page.getByRole("button",{name:"Close dialog",exact:true}).click();
 expect(backend.requests.filter(p=>p.endsWith("files/upload"))).toHaveLength(0);
 await page.getByLabel("Your feedback").fill("Use the attached color and layout references.");
 fs.mkdirSync("docs/evidence/member-files",{recursive:true});await picker.scrollIntoViewIfNeeded();if(!test.info().project.name.includes("Mobile"))await picker.screenshot({path:"docs/evidence/member-files/reference-images.png"});
 await page.getByRole("button",{name:"Review manually",exact:true}).click();
 let attempts=0;
 await page.route("**/crew-api/files/upload",async route=>{
   if(attempts++===0){await new Promise(resolve=>setTimeout(resolve,400));return route.fulfill({status:502,json:{error:{message:"Reference upload failed. Retry."}}});}
   return route.fallback();
 });
 await page.getByRole("button",{name:"Send revision request",exact:true}).click();
 await expect(picker.getByRole("progressbar").first()).toBeVisible();
 await expect(picker.getByRole("alert").first()).toContainText("Reference upload failed");
 expect(backend.snapshot.projects[0].revisions).toHaveLength(0);
 await page.getByRole("button",{name:"Send revision request",exact:true}).click();
 await expect.poll(()=>backend.snapshot.projects[0].revisions.length).toBe(1);
 const revision=backend.snapshot.projects[0].revisions[0];expect(revision.references).toHaveLength(2);
 expect(backend.snapshot.files).toHaveLength(2);expect(backend.snapshot.files!.every(f=>f.purpose==="revision_reference"&&f.projectId===task.id)).toBe(true);
 expect(task.deliveries).toHaveLength(1);expect(task.deliveries[0].status).not.toBe("accepted");
 await page.reload();await openTask(page);
 await expect(page.getByRole("region",{name:"Saved revision reference images"}).getByRole("button",{name:/Color direction.png/})).toBeVisible();
 await expect(page.getByRole("region",{name:"Member files"}).getByRole("button",{name:/Color direction.png/})).toHaveCount(0);
 await backend.worker();await openTask(page);
 await expect(page.getByRole("region",{name:"Saved revision reference images"}).getByRole("button",{name:/Layout reference.png/})).toBeVisible();
});

test("ordinary drafts and whiteboard object copy/paste survive task duplication removal",async({page,backend})=>{
 const id=crypto.randomUUID(),task=backend.snapshot.projects[0];
 backend.boards.push({id,project_id:task.id,author_id:backend.snapshot.actorId,updated_by:backend.snapshot.actorId,version:1,deleted:false,updated_at:new Date().toISOString(),data:{...newBoardData("note",450,360),text:"Copy this note"}});
 await page.goto("/");await page.getByRole("button",{name:"Project Whiteboard",exact:true}).click();
 await page.getByLabel("Fit to content",{exact:true}).click();await page.getByLabel("Select",{exact:true}).click();
 const note=page.locator(`.react-flow__node[data-id="${id}"]`);
 await note.click({button:"right"});await page.getByRole("menuitem",{name:"Copy",exact:true}).click();
 await note.click({button:"right"});await page.getByRole("menuitem",{name:"Paste",exact:true}).click();
 await expect.poll(()=>backend.boards.filter(b=>b.data.text==="Copy this note").length).toBe(2);
 expect(backend.snapshot.projects).toHaveLength(1);
 await page.getByRole("button",{name:"Project Studio",exact:true}).click();await page.locator(".workflow-heading").getByRole("button",{name:"+ Add task",exact:true}).click();
 const form=page.getByRole("dialog",{name:"Add task",exact:true});
 await form.getByLabel("Assigned to",{exact:true}).selectOption(backend.snapshot.people.find(p=>p.name==="Alex Reyes")!.id);
 await form.getByLabel("Task title",{exact:true}).fill("Ordinary saved draft");await form.getByLabel("The brief",{exact:true}).fill("Draft the launch plan before proposing terms.");await form.getByLabel(/Deliverables/).fill("Launch plan");
 await form.getByRole("combobox",{name:"Status",exact:true}).selectOption("draft");await form.getByRole("button",{name:"Create draft task",exact:true}).click();
 await expect.poll(()=>backend.snapshot.projects.find(p=>p.title==="Ordinary saved draft")?.agreements[0].status).toBe("draft");
 await expect(page.getByText("Duplicate as draft",{exact:true})).toHaveCount(0);
});
