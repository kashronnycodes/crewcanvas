import fs from "node:fs";
import { test, expect, openTask } from "./backend-fixture";

test("employer plans unassigned work, persists it, and assigns, changes and clears sample members", async ({ page, backend }) => {
  for (const [name, role] of [["Jamie Chen", "Designer"], ["Riley Santos", "Video editor"], ["Casey Morgan", "Producer"]]) {
    backend.snapshot.people.push({id:crypto.randomUUID(),name,role,email:"",sample:true,accessRole:"worker",initials:name.slice(0,2),color:"#cbd2e8",connected:false});
  }
  const samples=backend.snapshot.people.filter(p=>p.sample);
  await page.setViewportSize({width:1440,height:1080});
  await page.goto("/");
  await page.getByRole("button",{name:"Files & team",exact:true}).click();
  const team=page.getByRole("region",{name:"Team members"});
  await expect(team.getByText("Sample",{exact:true})).toHaveCount(3);
  await expect(team).toContainText("They have no account access");
  fs.mkdirSync("docs/evidence/employer-planning",{recursive:true});
  await team.screenshot({path:"docs/evidence/employer-planning/member-list.png"});
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();
  await page.locator(".hierarchy-role").getByRole("button",{name:"Designer",exact:true}).click();
  await page.getByRole("button",{name:"+ Add member",exact:true}).click();
  const rosterForm=page.getByRole("dialog",{name:"Add member to role",exact:true});
  await rosterForm.getByLabel("Workspace freelancer").selectOption(samples[0].id);
  await rosterForm.getByRole("button",{name:"Save",exact:true}).click();
  await expect(rosterForm).toHaveCount(0);
  expect(backend.snapshot.layout.workflow![0].roles[0].members).toContain(samples[0].id);
  await page.reload();
  await page.getByRole("button",{name:"Project Studio",exact:true}).click();await page.locator(".workflow-heading").getByRole("button",{name:"+ Add task",exact:true}).click();
  const form=page.getByRole("dialog",{name:"Add task",exact:true});
  await expect(form.getByLabel("Assigned to",{exact:true})).toHaveValue("");
  await expect(form.getByLabel("Assigned to",{exact:true}).getByRole("option",{name:/Jamie Chen · Sample/})).toHaveCount(1);
  await form.getByLabel("Task title",{exact:true}).fill("Plan the launch before hiring");
  await form.getByLabel("The brief",{exact:true}).fill("Plan our launch storyboard and delivery approach before choosing an assignee.");
  await form.getByLabel(/Deliverables/).fill("Launch storyboard");
  await form.evaluate(element => element.scrollTop=0);
  await form.screenshot({path:"docs/evidence/employer-planning/task-form.png"});
  await form.getByRole("button",{name:"Save task",exact:true}).click();
  await expect(form).toHaveCount(0);
  await expect.poll(()=>backend.snapshot.projects.some(p=>p.title==="Plan the launch before hiring"&&p.workerId===null)).toBe(true);
  const task=backend.snapshot.projects.find(p=>p.title==="Plan the launch before hiring")!;
  await page.reload();
  await openTask(page,task.title);
  const assignee=page.getByRole("combobox",{name:"Task assignee",exact:true});
  await expect(assignee).toHaveValue("");
  for (const id of [samples[0].id,samples[1].id,""]) {
    await assignee.selectOption(id);
    await page.getByRole("button",{name:"Save assignment",exact:true}).click();
    await expect.poll(()=>backend.snapshot.projects.find(p=>p.id===task.id)?.workerId).toBe(id||null);
    await expect(page.getByRole("button",{name:"Save assignment",exact:true})).toBeDisabled();
  }
  await page.getByRole("button",{name:"Close worker details",exact:true}).click();
  await page.getByRole("button",{name:"Project Studio",exact:true}).click();
  await expect(page.locator(".hierarchy-task").filter({hasText:task.title})).toContainText("Unassigned");
  await backend.worker();
  await expect(page.getByText(task.title,{exact:true})).toHaveCount(0);
  expect(backend.requests.filter(p=>p.endsWith("/invite"))).toHaveLength(0);
  expect(samples.every(p=>!p.authUserId)).toBe(true);
});

test("member-specific task creation can be cleared without silently selecting someone else", async ({ page, backend }) => {
  await page.goto("/");
  await openTask(page);
  await page.locator(".worker-drawer").getByRole("button",{name:"Add task",exact:true}).click();
  const form=page.getByRole("dialog",{name:"Add task",exact:true});
  await expect(form.getByLabel("Assigned to",{exact:true})).toHaveValue(backend.snapshot.people.find(p=>p.name==="Alex Reyes")!.id);
  await form.getByLabel("Assigned to",{exact:true}).selectOption("");
  await expect(form.getByLabel("Assigned to",{exact:true})).toHaveValue("");
  await form.getByRole("button",{name:"Cancel",exact:true}).click();
  expect(backend.snapshot.projects).toHaveLength(1);
});
