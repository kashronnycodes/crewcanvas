import type {Project,WorkspaceSnapshot} from "./types.ts";
export function canManageTasks(s:WorkspaceSnapshot):boolean{
  return s.people.some(p=>p.id===s.actorId&&p.accessRole==="employer");
}
export function accessibleTasks(s:WorkspaceSnapshot):Project[]{
  return canManageTasks(s)?s.projects:s.projects.filter(p=>p.workerId===s.actorId);
}
export function taskForActor(s:WorkspaceSnapshot,id:string|undefined):Project|undefined{
  return id?accessibleTasks(s).find(p=>p.id===id):undefined;
}
