import { test, expect, openRole, openTask } from "./backend-fixture";
import { newBoardData } from "../shared/board";
test("all entry URLs require sign-in without a real session",async({page})=>{
 await page.route("https://rate-test.supabase.co/**",route=>route.fulfill({json:{disable_signup:true}}));
 for(const url of ["/","/?demo=1&account=employer"]){await page.goto(url);await expect(page.getByLabel("Email address")).toBeVisible();await expect(page.getByText(/Interactive demo|Demo Studio/)).toHaveCount(0);}
});
test("compact shell, workspace menu, mobile fit, and keyboard focus",async({page,backend})=>{
 await page.goto("/");await expect(page.getByLabel("Studio project")).toBeVisible();
 await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
 await expect(page.getByRole("button",{name:/Switch workspace:/})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole("button",{name:"Workspace menu",exact:true}).click();
 await expect(page.getByRole("button",{name:"Invite member",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Workspaces"}).focus();await page.keyboard.press("Escape");
 await expect(page.getByRole("button",{name:"Workspace menu",exact:true})).toBeFocused();
 await expect(page.getByRole("navigation",{name:"Workspace pages"}).getByRole("button")).toHaveCount(2);
 await page.getByRole("button",{name:"Project Whiteboard",exact:true}).click();await expect(page.getByRole("heading",{name:"Project Whiteboard",exact:true})).toBeVisible();
 expect(backend.requests.some(p=>p.endsWith("/snapshot"))).toBe(true);
});
test("Pan is real viewport behavior, Select is explicit, and reopened boards reset",async({page,backend})=>{
 await page.goto("/");await expect(page.getByLabel("Pan",{exact:true})).toHaveAttribute("aria-pressed","true");
 const pane=page.locator(".project-board .react-flow__pane"),viewport=page.locator(".project-board .react-flow__viewport");
 await page.locator(".project-board").scrollIntoViewIfNeeded();
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const before=await viewport.getAttribute("style"); const box=(await pane.boundingBox())!;
 if(!test.info().project.name.includes("Mobile")){
 await page.mouse.move(box.x+box.width*.75,box.y+box.height*.8);await page.mouse.down();await page.mouse.move(box.x+box.width*.75-80,box.y+box.height*.8-45,{steps:8});await page.mouse.up();
 await expect(viewport).not.toHaveAttribute("style",before!);
 }
 await page.getByLabel("Select",{exact:true}).click();await expect(page.getByLabel("Select",{exact:true})).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:"Project Whiteboard",exact:true}).click();await expect(page.getByLabel("Whiteboard project",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Project Studio",exact:true}).click();
 await expect(page.getByLabel("Pan",{exact:true})).toHaveAttribute("aria-pressed","true");
 await page.getByRole("button",{name:"Project Whiteboard",exact:true}).click();await expect(page.getByLabel("Pan",{exact:true})).toHaveAttribute("aria-pressed","true");
 await page.reload();await expect(page.getByLabel("Pan",{exact:true})).toHaveAttribute("aria-pressed","true");
});
test("card buttons work in Pan; role/member/task Back and member task assignment",async({page,backend})=>{
 await page.goto("/");await openTask(page);
 await expect(page.getByRole("combobox",{name:"Member panel view"})).toHaveCount(0);
 await page.locator(".worker-drawer").getByRole("button",{name:"Add task",exact:true}).click();
 await expect(page.getByRole("combobox",{name:"Assigned to",exact:true})).toHaveValue(backend.snapshot.people.find(p=>p.name==="Alex Reyes")!.id);
 await page.getByLabel("Task title").fill("Create launch card");await page.getByLabel("The brief").fill("Design the final launch card using the approved brand colors.");await page.getByRole("textbox",{name:/Deliverables/}).fill("One final PNG");
 await page.getByRole("button",{name:"Create task & propose terms"}).click();
 await openTask(page,"Create launch card");
 await expect(page.locator("#project-select")).toContainText("Create launch card");
 const task=backend.snapshot.projects.find(p=>p.title==="Create launch card")!;
 expect(task.workerId).toBe(backend.snapshot.people[1].id);
 await page.locator("#project-select").selectOption(task.id);
 await expect(page.getByRole("region",{name:"Member files"})).toBeVisible();
 await page.getByRole("button",{name:"← Back",exact:true}).click();await expect(page.getByRole("heading",{name:"Project Studio",exact:true})).toBeVisible();
 await openRole(page);await page.getByRole("complementary",{name:"Role roster"}).getByRole("button",{name:"← Back",exact:true}).click();await expect(page.getByRole("complementary",{name:"Role roster"})).toHaveCount(0);
 await page.reload();expect(backend.snapshot.projects.some(p=>p.id===task.id)).toBe(true);
});
test("general task assignment stays available; AI errors never become simulated answers",async({page,backend})=>{
 await page.goto("/");await page.locator(".workflow-heading").getByRole("button",{name:"+ Add task",exact:true}).click();
 await expect(page.getByRole("combobox",{name:"Assigned to",exact:true})).toBeVisible();await page.getByRole("button",{name:/← Back/}).click();
 await page.locator(".studio-assistant summary").click();await page.getByLabel("Workspace AI question").fill("What needs my attention?");await page.getByRole("button",{name:"Ask workspace AI"}).click();
 await expect(page.getByRole("alert")).toContainText("AI is unavailable");await expect(page.getByText(/Simulated demo response/)).toHaveCount(0);
});
test("whiteboard note edits persist through HTTP; objects stay fixed in Pan",async({page,backend})=>{
 const task=backend.snapshot.projects[0];backend.boards.push({id:crypto.randomUUID(),project_id:task.id,author_id:backend.snapshot.actorId,updated_by:backend.snapshot.actorId,version:1,deleted:false,updated_at:new Date().toISOString(),data:{...newBoardData("note",700,80),text:"Shared plan"}});
 await page.goto("/");await page.getByRole("button",{name:"Project Whiteboard",exact:true}).click();await page.getByLabel("Fit to content",{exact:true}).click();
 await page.getByLabel("Add sticky note",{exact:true}).click();await page.getByRole("textbox",{name:"Content",exact:true}).fill("Save our launch plan");await page.getByRole("button",{name:"Save object",exact:true}).click();
 await expect.poll(()=>backend.boards.some(b=>b.data.text==="Save our launch plan")).toBe(true);
 await page.getByLabel("Close object inspector",{exact:true}).click();await page.getByLabel("Pan",{exact:true}).click();
 expect(await page.locator('.react-flow__node.draggable').count()).toBe(0);
 await page.reload();await expect(page.getByLabel("Pan",{exact:true})).toHaveAttribute("aria-pressed","true");expect(backend.boards.some(b=>b.data.text==="Save our launch plan")).toBe(true);
});
test("freelancers see the same features within their account permissions",async({page,backend})=>{
 await page.goto("/");await backend.worker();await expect(page.getByRole("heading",{name:"My Tasks",exact:true})).toBeVisible();
 await expect(page.locator(".workflow-heading").getByRole("button",{name:"New project"})).toHaveCount(0);
 await page.getByRole("button",{name:"Workspace menu",exact:true}).click();await expect(page.getByRole("button",{name:"Invite member",exact:true})).toHaveCount(0);
});

test("new empty boards start in Pan and retain their project after refresh", async ({page,backend}) => {
 await page.goto("/");await page.getByRole("button",{name:"New project",exact:true}).click();
 await page.getByLabel("Project title",{exact:true}).fill("Next launch");await page.getByRole("button",{name:"Save",exact:true}).click();
 expect(backend.snapshot.layout.workflow?.find(c=>c.title==="Next launch")?.roles).toEqual([]);
 await expect(page.locator(".workflow-empty-canvas")).toBeVisible();await expect(page.getByLabel("Pan",{exact:true})).toHaveAttribute("aria-pressed","true");
 await page.getByLabel("Select",{exact:true}).click();await page.getByLabel("Studio project").selectOption(backend.snapshot.id);await page.getByLabel("Studio project").selectOption({label:"Next launch"});
 await expect(page.getByLabel("Pan",{exact:true})).toHaveAttribute("aria-pressed","true");await page.reload();await expect(page.getByLabel("Studio project")).toContainText("Next launch");
});
test("touch pans the board and trackpad scroll can zoom", async ({page,backend},info) => {
 await page.goto("/");const board=page.locator(".project-board");await board.scrollIntoViewIfNeeded();await expect(page.getByLabel("Add sticky note")).toBeEnabled();
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const viewport=board.locator(".react-flow__viewport");const box=(await board.boundingBox())!;const x=box.x+box.width*.7,y=box.y+200;
 if(info.project.name==="Mobile Chrome"){
  const cdp=await page.context().newCDPSession(page);const before=await viewport.getAttribute("style");
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x,y}]});
  for(let i=1;i<=6;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:x-i*10,y:y+i*5}]});
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await expect(viewport).not.toHaveAttribute("style",before!);await cdp.detach();
 }else if(info.project.name==="chromium"){
  const before=await viewport.getAttribute("style");await page.mouse.move(x,y);await page.mouse.wheel(0,-100);await expect(viewport).not.toHaveAttribute("style",before!);
 }
});
