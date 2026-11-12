import {memberTaskRoster,type SummarySource} from "../../../shared/member-tasks.ts";
import type {Person,SessionActor,WorkflowCollection} from "../../../shared/types.ts";
import {admin,HttpError} from "./backend.ts";

export async function rosterSummaries(actor:SessionActor){
  if(actor.role!=="employer")throw new HttpError(403,"FORBIDDEN","Task monitoring is available only to the project owner in Project Studio.");
  const db=admin();
  const [members,tasks,layout,workspace]=await Promise.all([
    db.from("memberships").select("id,access_role,data").eq("workspace_id",actor.workspaceId),
    db.from("projects").select("id,worker_id,data").eq("workspace_id",actor.workspaceId),
    db.from("canvas_layouts").select("data").eq("workspace_id",actor.workspaceId).single(),
    db.from("workspaces").select("name").eq("id",actor.workspaceId).single(),
  ]);
  if(members.error||tasks.error||layout.error||workspace.error)throw new HttpError(503,"ROSTER_UNAVAILABLE","Could not load the project roster. Try again.");
  if(!members.data.some(m=>m.id===actor.id&&m.access_role===actor.role))throw new HttpError(403,"FORBIDDEN","This workspace roster is not available to your account.");
  const people=members.data.map(m=>({...m.data,id:m.id,accessRole:m.access_role} as Person));
  const states=new Set(["awaiting_agreement","in_progress","submitted","changes_requested","accepted"]);
  const summaries:SummarySource[]=tasks.data.map(t=>{
    if(!states.has(t.data.state))throw new HttpError(409,"INVALID_STATUS","A saved task status needs attention.");
    return {id:t.id,workerId:t.worker_id,title:t.data.title,state:t.data.state,organization:t.data.organization,parentProjectId:t.data.parentProjectId};
  });
  return memberTaskRoster(actor,people,summaries,(layout.data.data.workflow??[]) as WorkflowCollection[],workspace.data.name);
}
