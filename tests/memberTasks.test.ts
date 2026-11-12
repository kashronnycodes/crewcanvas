import {it,expect} from "vitest";
import {seedWorkspace,IDS} from "../shared/seed";
import {memberTaskRoster,deadlineOrderedTasks} from "../shared/member-tasks";
import {accessibleTasks,taskForActor} from "../shared/task-access";
it("regular members cannot obtain any member task list from the retired summary response",()=>{
 const s=seedWorkspace();expect(()=>memberTaskRoster({id:IDS.ava,role:"worker",workspaceId:s.id},s.people,s.projects,s.layout.workflow??[],s.name)).toThrow(/project owner/);
});
it("owners retain overall project/task monitoring",()=>{
 const s=seedWorkspace();const roster=memberTaskRoster({id:s.actorId,role:"employer",workspaceId:s.id},s.people,s.projects,s.layout.workflow??[],s.name);
 expect(roster.members.flatMap(m=>m.tasks).map(t=>t.id).sort()).toEqual(s.projects.filter(t=>t.workerId&&s.people.some(p=>p.id===t.workerId&&p.accessRole==="worker")).map(t=>t.id).sort());
});
it("My Tasks and explicit task navigation use membership IDs and reject a peer or unassigned task",()=>{
 const s=seedWorkspace();s.actorId=IDS.ava;const own=s.projects.find(t=>t.workerId===IDS.ava)!;
 const peer={...own,id:"peer-task",workerId:"someone-else"};const unassigned={...own,id:"unassigned",workerId:null};s.projects.push(peer,unassigned);
 expect(accessibleTasks(s).every(t=>t.workerId===s.actorId)).toBe(true);
 expect(taskForActor(s,peer.id)).toBeUndefined();expect(taskForActor(s,unassigned.id)).toBeUndefined();expect(taskForActor(s,own.id)?.id).toBe(own.id);
 s.actorId=IDS.myron;expect(taskForActor(s,peer.id)?.id).toBe(peer.id);expect(taskForActor(s,unassigned.id)?.id).toBe(unassigned.id);
});
it("orders My Tasks by deadline, missing dates last, with stable ties",()=>{
 const s=seedWorkspace();const original=s.projects[0];
 const task=(id:string,date:string)=>({...structuredClone(original),id,workerId:IDS.ava,agreements:original.agreements.map(a=>({...a,deadline:date}))});
 expect(deadlineOrderedTasks([task("z",""),task("b","2026-12-20"),task("a","2026-12-20"),task("c","2026-11-20")],IDS.ava).map(t=>t.id)).toEqual(["c","a","b","z"]);
});
