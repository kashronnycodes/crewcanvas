import {lazy,Suspense,useEffect,useState} from "react";
import {ArrowUpRight} from "lucide-react";
import {activeAgreement,todayIn,invoiceAttention} from "../../shared/domain";
import {taskLabels,studioProjects} from "../../shared/studio";
import {accessibleTasks,canManageTasks,taskForActor} from "../../shared/task-access";
import {deadlineOrderedTasks} from "../../shared/member-tasks";
import type {CanvasLayout,Project,WorkspaceSnapshot} from "../../shared/types";
import type {Command} from "../../shared/validation";
import {useStudioNavigation,type StudioRoute} from "../studioNavigation";
import Modal from "./Modal";
import MemberInfo from "./MemberInfo";
import ProjectDrawer from "./ProjectDrawer";
import StudioOrganization from "./StudioOrganization";
import TeamMembers from "./TeamMembers";
import WorkspaceAssistant from "./WorkspaceAssistant";
import {FileInspector,FilePicker} from "./WorkspaceFiles";
const WorkflowCanvas=lazy(()=>import("./WorkflowCanvas"));
const ProjectBoard=lazy(()=>import("./ProjectBoard"));

function TaskCard({task,onOpen}:{task:Project;onOpen:()=>void}){
  const terms=activeAgreement(task)??task.agreements.at(-1);
  return <article className="studio-task">
    <span className={`pill work-${task.state}`}>{taskLabels[task.state]}</span>
    <button className="project-title-link" onClick={onOpen}>{task.title}<ArrowUpRight size={16}/></button>
    <p>{terms?.brief??"No task brief yet."}</p>
    <div className="studio-task-meta">{terms?.deadline?`Due ${terms.deadline}`:"No due date"}</div>
  </article>;
}
export default function StudioWorkspace({snapshot:s,view,search,onCommand,onIssue,onRefresh,onSaveLayout,busy,notify,onInvite}:{
  snapshot:WorkspaceSnapshot;view:"studio"|"board";search:string;
  onCommand:(c:Command)=>Promise<boolean>;onIssue:(id:string)=>Promise<boolean>;onRefresh:(id:string)=>Promise<boolean>;
  onSaveLayout:(layout:CanvasLayout)=>Promise<unknown>;busy:boolean;notify:(message:string)=>void;onInvite:(role?:string)=>void;
}){
  const {route,open,back,close}=useStudioNavigation(`${s.id}:${s.actorId}`);
  const employer=canManageTasks(s);
  const tasks=accessibleTasks(s);
  const visible={...s,projects:tasks};
  const projects=studioProjects(visible);
  const project=projects.find(p=>p.id===route.projectId);
  const role=project?.roles.find(r=>r.id===route.role||r.name===route.role);
  const person=s.people.find(p=>p.id===route.memberId);
  const task=taskForActor(s,route.taskId);
  const taskPerson=s.people.find(p=>p.id===task?.workerId);
  const [fileId,setFileId]=useState<string|null>(null);
  const file=s.files?.find(f=>f.id===fileId&&(employer||tasks.some(t=>t.id===f.projectId)));
  const studio=view==="studio";
  function go(next:StudioRoute){document.dispatchEvent(new Event("crewcanvas:exit-focus"));open(next);}
  // Notifications and existing deep links still open only explicitly authorized tasks.
  useEffect(()=>{
    const select=(event:Event)=>{
      const {id,projectId,filter,tab}=(event as CustomEvent).detail;
      const selected=accessibleTasks(s).find(p=>p.workerId===id&&(projectId?p.id===projectId:filter==="attention"?p.invoices.some(i=>invoiceAttention(i,todayIn(s.timezone))):filter==="completed"?p.state==="accepted":true));
      if(selected)go({taskId:selected.id,tab:filter==="attention"?"payments":tab});
    };
    window.addEventListener("crewcanvas:open-work",select);return()=>window.removeEventListener("crewcanvas:open-work",select);
  },[s,open]);
  // Changing the main page leaves its task/form navigation behind.
  useEffect(()=>{close();},[view]);
  const own=deadlineOrderedTasks(tasks,s.actorId).filter(t=>`${t.title} ${activeAgreement(t)?.brief??t.agreements.at(-1)?.brief??""}`.toLowerCase().includes(search.toLowerCase()));
  return <div className={`studio-workspace ${employer&&studio?"has-reference-canvas":""}`}>
    <div className="studio-utilities">
      <div className="studio-heading"><button className="button secondary" onClick={()=>go({tools:true})}>Files & team</button></div>
      <WorkspaceAssistant snapshot={visible}/>
    </div>
    <Suspense fallback={<p role="status">Opening workspace…</p>}>
      {!studio?<ProjectBoard snapshot={visible} notify={notify}/>:employer?
        <WorkflowCanvas snapshot={s} onSave={onSaveLayout as (layout:CanvasLayout)=>Promise<CanvasLayout|undefined>}
          onOpen={()=>{}} onCommand={onCommand} onInvite={onInvite} notify={notify} detailedByDefault
          search={search} navigation={{route,open:go,back,close}} detailsOpen={!!route.taskId||!!route.memberId}/>
        :<section aria-label="My Tasks" className="my-tasks">
          <p className="fine-print">Your assigned tasks, ordered by due date.</p>
          <div className="studio-task-grid">{own.map(t=><TaskCard key={t.id} task={t} onOpen={()=>go({taskId:t.id})}/>)}</div>
          {!own.length&&<p className="task-empty">{search?"No matching tasks.":"No tasks assigned yet."}</p>}
        </section>}
    </Suspense>
    {route.taskId?(task?<ProjectDrawer studio key={task.id} person={taskPerson} snapshot={visible} initialFilter="all"
      initialProjectId={task.id} initialTab={route.tab??"overview"} onClose={back} onBack={back}
      onAddTask={employer&&studio?()=>go({projectId:route.projectId,memberId:task.workerId??undefined,form:true}):undefined}
      onCommand={onCommand} onIssue={onIssue} onRefresh={onRefresh} busy={busy} onNotify={notify}/>
      :<Modal title="Task unavailable" onClose={close}><p>This task is not available to your account.</p></Modal>)
    :route.memberId&&!route.form?(person?<MemberInfo person={person} role={role?.name} onClose={back}/>:<Modal title="Member unavailable" onClose={close}><p>This member is not available in this project.</p></Modal>)
    :route.tools?<Modal wide title="Files & team" onClose={back}>
      {employer?<StudioOrganization snapshot={s} onSave={onSaveLayout} onInvite={()=>onInvite()}/>:<TeamMembers snapshot={s} onInvite={()=>{}}/>}
      <h3>Workspace files</h3><FilePicker snapshot={visible} projectId={employer?null:tasks[0]?.id}/>
      <div className="studio-file-list">{s.files?.filter(f=>f.purpose!=="revision_reference"&&(employer||tasks.some(t=>t.id===f.projectId))).map(f=><button className="button secondary" key={f.id} onClick={()=>setFileId(f.id)}>{f.name} · v{f.versions.length}</button>)}</div>
      {file&&<FileInspector key={`${file.id}-${file.version}`} file={file} snapshot={visible} onClose={()=>setFileId(null)} onNotify={notify}/>}
      <details><summary>Activity timeline</summary>{[...(s.workspaceActivity??[]),...tasks.flatMap(p=>p.activity)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(event=><p key={event.id}>{event.text}<small> · {new Date(event.createdAt).toLocaleString(undefined,{timeZone:s.timezone})}</small></p>)}</details>
    </Modal>:null}
    {/* General forms in Project Studio are managed by WorkflowCanvas. The task
        page's Add task route retains its member-specific default there. */}
  </div>;
}
