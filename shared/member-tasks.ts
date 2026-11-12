import type {Person,Project,SessionActor,WorkflowCollection,WorkState} from "./types.ts";
import {DomainError} from "./domain.ts";
import {visibleTerms} from "./freelance-canvas.ts";

export type RosterTask={id:string;title:string;state:WorkState};
export type RosterMember=Pick<Person,"id"|"name"|"role"|"color">&{sample?:boolean;tasks:RosterTask[]};
export type MemberTaskRoster={members:RosterMember[];collections:{id:string;title:string;memberIds:string[]}[]};
export type SummarySource=RosterTask&{workerId:string|null;organization?:Project["organization"];parentProjectId?:string};

// This allowlist is deliberately separate from the private Project contract.
// Never spread stored member/task JSON into this response.
export function memberTaskRoster(actor:SessionActor,people:Person[],tasks:SummarySource[],saved:WorkflowCollection[],workspaceName:string):MemberTaskRoster{
  if(actor.role!=="employer")throw new DomainError("FORBIDDEN","Task monitoring is available only to the project owner.");
  const workers=people.filter(p=>p.accessRole==="worker");
  const collections=saved.length?[...saved]:[{id:actor.workspaceId,title:workspaceName,roles:[{id:actor.workspaceId,name:"Team",members:workers.map(p=>p.id)}]}];
  // Mirror legacy project families without broadening workspace/task access.
  // Membership in a family comes only from an actual assignment in that family.
  const parents=[...new Set(tasks.filter(t=>!t.organization&&t.parentProjectId).map(t=>t.parentProjectId!))];
  for(const id of parents){if(collections.some(c=>c.id===id))continue;
    const family=tasks.filter(t=>!t.organization&&(t.id===id||t.parentProjectId===id));
    collections.push({id,title:tasks.find(t=>t.id===id)?.title??"Assigned project",roles:[{id,name:"Team",members:workers.filter(p=>family.some(t=>t.workerId===p.id)).map(p=>p.id)}]});
  }
  const allowed=collections;
  const ids=new Set(allowed.flatMap(c=>c.roles.flatMap(r=>r.members)));
  workers.forEach(p=>ids.add(p.id));
  return {
    collections:allowed.map(c=>({id:c.id,title:c.title,memberIds:[...new Set(c.roles.flatMap(r=>r.members))].filter(id=>workers.some(p=>p.id===id))})),
    members:workers.filter(p=>ids.has(p.id)).map(p=>({id:p.id,name:p.name,role:p.role,color:p.color,...(p.sample?{sample:true}:{}),tasks:tasks.filter(t=>t.workerId===p.id).map(t=>({id:t.id,title:t.title,state:t.state})).sort((a,b)=>a.id.localeCompare(b.id))})),
  };
}

export function deadlineOrderedTasks(projects:Project[],memberId:string):Project[]{
  return projects.filter(p=>p.workerId===memberId).map(p=>({p,due:visibleTerms(p)?.deadline||null})).sort((a,b)=>{
    if(a.due!==b.due){if(!a.due)return 1;if(!b.due)return -1;return a.due.localeCompare(b.due);}
    return a.p.id.localeCompare(b.p.id);
  }).map(({p})=>p);
}
