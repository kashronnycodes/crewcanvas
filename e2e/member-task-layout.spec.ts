import fs from "node:fs";
import {test,expect,openRole,openTask} from "./backend-fixture";
const evidence="docs/evidence/member-navigation";
test.use({viewport:{width:1440,height:1080}});

test("member clicks show basic information, with no nested task browser",async({page,backend})=>{
 const before=JSON.stringify(backend.snapshot.projects);await page.goto("/");await openRole(page);await page.locator(".roster-member").filter({hasText:"Alex Reyes"}).click();
 const info=page.getByRole("dialog",{name:"Alex Reyes",exact:true});await expect(info).toContainText("Designer");await expect(info.getByText("Project role",{exact:true})).toBeVisible();
 await expect(info.getByRole("combobox")).toHaveCount(0);await expect(info.getByRole("button",{name:/task/i})).toHaveCount(0);await expect(info).not.toContainText("Launch video");await expect(page.locator(".member-task-card,.member-task-avatars")).toHaveCount(0);
 fs.mkdirSync(evidence,{recursive:true});await info.screenshot({path:`${evidence}/member-info.png`});
 await info.getByRole("button",{name:"Close dialog",exact:true}).click();await expect(page.getByRole("complementary",{name:"Role roster"})).toBeVisible();expect(JSON.stringify(backend.snapshot.projects)).toBe(before);
});

test("My Tasks includes only authenticated membership assignments and rejects direct peer links and APIs",async({page,backend})=>{
 const own=backend.snapshot.projects[0];const peer={...structuredClone(own),id:crypto.randomUUID(),workerId:crypto.randomUUID(),title:"Private peer task"};const unassigned={...structuredClone(own),id:crypto.randomUUID(),workerId:null,title:"Private unassigned task"};backend.snapshot.projects.push(peer,unassigned);
 await page.goto("/");await backend.worker();await expect(page.getByRole("heading",{name:"My Tasks",exact:true})).toBeVisible();
 const mine=page.getByRole("region",{name:"My Tasks",exact:true});await expect(mine.getByRole("button",{name:own.title,exact:true})).toBeVisible();await expect(page.getByText(peer.title,{exact:true})).toHaveCount(0);await expect(page.getByText(unassigned.title,{exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:"Project Studio",exact:true})).toHaveCount(0);await expect(page.getByRole("button",{name:/Add task/,exact:true})).toHaveCount(0);
 await page.screenshot({path:`${evidence}/my-tasks.png`,fullPage:true});await openTask(page);await expect(page.getByRole("region",{name:"Task details",exact:true})).toContainText(own.title);await page.getByRole("button",{name:"Close worker details",exact:true}).click();
 await page.evaluate(id=>{const state={...history.state,crewStudio:{...history.state.crewStudio,route:{taskId:id},depth:0}};history.replaceState(state,"",`/?taskId=${id}`);dispatchEvent(new PopStateEvent("popstate",{state}));},peer.id);await expect(page.getByRole("dialog",{name:"Task unavailable",exact:true})).toBeVisible();await expect(page.getByText(peer.title,{exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Close dialog",exact:true}).click();
 const checks=await page.evaluate(async peerId=>{const base="https://rate-test.supabase.co";const r=await fetch(`${base}/functions/v1/crew-api/roster/summaries`);const command=await fetch(`${base}/functions/v1/crew-api/command`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"discuss",projectId:peerId,text:"Unauthorized"})});const rows=await fetch(`${base}/rest/v1/projects?id=eq.${peerId}&select=id`);return{summary:r.status,command:command.status,rows:await rows.json()};},peer.id);
 expect(checks).toEqual({summary:403,command:403,rows:[]});
 await page.getByRole("button",{name:"Project Whiteboard",exact:true}).click();await expect(page.getByRole("button",{name:"Task details",exact:true})).toHaveCount(0);await expect(page.locator(".hierarchy-task")).toHaveCount(0);await expect(page.getByLabel("Whiteboard project")).not.toContainText(peer.title);
});

test("all task sections share one scrolling page and the task picker updates them",async({page,backend})=>{
 const a=backend.snapshot.projects[0],b={...structuredClone(a),id:crypto.randomUUID(),title:"Second task"};backend.snapshot.projects.push(b);await page.goto("/");await openTask(page);
 const drawer=page.locator(".worker-drawer");expect(await drawer.locator("[data-task-section]").evaluateAll(nodes=>nodes.map(n=>n.getAttribute("aria-label")))).toEqual(["Task details","Files and previews","Revisions","Payments","Activity"]);await expect(drawer.getByRole("combobox",{name:"Member panel view"})).toHaveCount(0);
 await drawer.locator("#project-select").selectOption(b.id);await expect(drawer.locator(".task-page-title")).toHaveText(b.title);await expect(drawer.getByRole("region",{name:"Files and previews",exact:true})).toContainText("No files");await drawer.getByRole("button",{name:"Close worker details",exact:true}).click();
 await page.getByRole("button",{name:"Project Whiteboard",exact:true}).click();await expect(page.locator(".hierarchy-task")).toHaveCount(0);await expect(page.getByRole("button",{name:"Task details",exact:true})).toHaveCount(0);await expect(page.locator(".workflow-heading")).toHaveCount(0);await expect(page.getByLabel("Add sticky note",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Files & team",exact:true}).click();await expect(page.getByRole("dialog").locator(".project-board")).toHaveCount(0);
});

test("owners create and edit tasks, members accept and submit files, and approval still requires confirmation",async({page,backend})=>{
 test.setTimeout(60000);
 await page.goto("/");await page.locator(".workflow-heading").getByRole("button",{name:"+ Add task",exact:true}).click();const form=page.getByRole("dialog",{name:"Add task",exact:true});
 await form.getByLabel("Assigned to",{exact:true}).selectOption(backend.snapshot.people.find(p=>p.name==="Alex Reyes")!.id);await form.getByLabel("Task title",{exact:true}).fill("Navigation regression · launch card");await form.getByLabel("The brief",{exact:true}).fill("Create a launch card for the owner to review.");await form.getByLabel(/Deliverables/).fill("One launch PNG");await form.getByRole("button",{name:"Create task & propose terms",exact:true}).click();await expect(form).toHaveCount(0);
 const title="Navigation regression · launch card";const task=backend.snapshot.projects.find(t=>t.title===title)!;expect(task.workerId).toBe(backend.snapshot.people[1].id);await openTask(page,title);
 await backend.worker();await openTask(page,title);await page.getByRole("button",{name:"Accept agreement",exact:true}).last().click();await expect.poll(()=>backend.snapshot.projects.find(t=>t.id===task.id)?.state).toBe("in_progress");
 await backend.owner();await openTask(page,title);
 await page.getByRole("button",{name:"Propose changes",exact:true}).click();const edit=page.getByRole("dialog",{name:"Propose updated terms",exact:true});await edit.getByLabel("The brief",{exact:true}).fill("Create a blue launch card for the owner to review.");await edit.getByRole("button",{name:"Propose agreement",exact:true}).click();await expect(edit).toHaveCount(0);
 await backend.worker();await openTask(page,title);await page.getByRole("button",{name:"Accept agreement",exact:true}).last().click();await expect.poll(()=>backend.snapshot.projects.find(t=>t.id===task.id)?.state).toBe("in_progress");
 const files=page.getByRole("region",{name:"Member files",exact:true});await files.locator('input[type="file"]').setInputFiles("e2e/fixtures/color-reference.png");await expect(files.getByRole("button",{name:/color-reference.png/})).toBeVisible();const file=backend.snapshot.files!.find(f=>f.projectId===task.id)!;await page.getByRole("combobox",{name:"Project file",exact:true}).selectOption(file.id);await page.getByLabel("Version label",{exact:true}).fill("Launch card v1");await page.getByRole("button",{name:"Submit for review",exact:true}).click();await expect.poll(()=>backend.snapshot.projects.find(t=>t.id===task.id)?.state).toBe("submitted");
 await backend.owner();await openTask(page,title);await page.getByRole("button",{name:"Approve work",exact:true}).click();await page.getByRole("dialog",{name:"Approve this submission?",exact:true}).getByRole("button",{name:"Cancel",exact:true}).click();expect(backend.snapshot.projects.find(t=>t.id===task.id)?.state).toBe("submitted");await page.getByRole("button",{name:"Approve work",exact:true}).click();await page.getByRole("button",{name:"Yes, approve work",exact:true}).click();await expect.poll(()=>backend.snapshot.projects.find(t=>t.id===task.id)?.state).toBe("accepted");expect(backend.snapshot.projects.find(t=>t.id===task.id)?.invoices).toHaveLength(0);
 await page.reload();await openTask(page,title);await expect(page.getByRole("region",{name:"Revision notes",exact:true})).toContainText("Approved");
});
