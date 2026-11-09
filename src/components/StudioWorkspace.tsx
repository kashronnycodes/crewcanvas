import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowUpRight, PenTool, Plus } from "lucide-react";
import type {
  CanvasLayout,
  Project,
  WorkspaceSnapshot,
} from "../../shared/types";
import type { Command } from "../../shared/validation";
import {
  activeAgreement,
  invoiceAttention,
  money,
  todayIn,
} from "../../shared/domain";
import { studioProjects, taskLabels, taskPayment } from "../../shared/studio";
import { type StudioRoute, useStudioNavigation } from "../studioNavigation";
import Modal from "./Modal";
import TaskForm from "./TaskForm";
import ProjectDrawer from "./ProjectDrawer";
import WorkspaceAssistant from "./WorkspaceAssistant";
import StudioOrganization from "./StudioOrganization";
import { FileInspector, FilePicker } from "./WorkspaceFiles";
const HierarchyBoard = lazy(() => import("./HierarchyBoard"));
const ProjectBoard = lazy(() => import("./ProjectBoard"));

function TaskCard(
  { task, onOpen, revisions = false }: {
    task: Project;
    onOpen: () => void;
    revisions?: boolean;
  },
) {
  const payment = taskPayment(task),
    latest = task.deliveries.at(-1),
    terms = activeAgreement(task) ?? task.agreements.at(-1);
  return (
    <article className="studio-task">
      <div className="project-meta">
        <span className={`pill work-${task.state}`}>
          {taskLabels[task.state]}
        </span>
        <small>
          {task.origin === "sample" ? "Sample data" : "PayPal Sandbox"}
        </small>
      </div>
      <button className="project-title-link" onClick={onOpen}>
        {task.title}
        <ArrowUpRight size={16} />
      </button>
      <p>{terms?.brief ?? "Scope awaiting proposal"}</p>
      <div className="studio-task-meta">
        <span>Due {terms?.deadline ?? "not set"}</span>
        <strong>
          {activeAgreement(task)
            ? money(payment.total.toString())
            : `${money(terms?.amountMinor ?? "0")} proposed`}
        </strong>
      </div>
      <small>Latest work: {latest?.label ?? "No deliverable yet"}</small>
      {revisions && (
        <div className="revision-digest">
          {task.revisions.length
            ? task.revisions.map((revision) => (
              <div key={revision.id}>
                <strong>{revision.text}</strong>
                {revision.items.map((item) => {
                  const proposal = task.proposals.filter((p) =>
                    p.itemId === item.id
                  ).at(-1);
                  return (
                    <p key={item.id}>
                      {item.text} · {item.disposition.replaceAll("_", " ")}
                      {proposal
                        ? ` · ${money(proposal.amountMinor)} ${proposal.status}`
                        : item.disposition === "included"
                        ? " · Included / free"
                        : " · No fee agreed"}
                      {proposal?.status === "pending"
                        ? ` · Awaiting ${
                          proposal.authorId === task.workerId
                            ? "employer"
                            : "freelancer"
                        }`
                        : ["awaiting_response", "clarification"].includes(
                            item.disposition,
                          )
                        ? " · Awaiting freelancer"
                        : ""}
                    </p>
                  );
                })}
              </div>
            ))
            : <p>No revision requests yet.</p>}
        </div>
      )}
      <footer>
        <span>{payment.status}</span>
        <button className="text-button" onClick={onOpen}>
          {revisions ? "Deliverable & revision details" : "Task details"} →
        </button>
      </footer>
    </article>
  );
}
export default function StudioWorkspace(
  {
    snapshot: s,
    view,
    search,
    onCommand,
    onIssue,
    onRefresh,
    onSaveLayout,
    busy,
    notify,
  }: {
    snapshot: WorkspaceSnapshot;
    view: "list" | "board" | "revisions";
    search: string;
    onCommand: (c: Command) => Promise<boolean>;
    onIssue: (id: string) => Promise<boolean>;
    onRefresh: (id: string) => Promise<boolean>;
    busy: boolean;
    notify: (text: string) => void;
    onSaveLayout: (layout: CanvasLayout) => Promise<unknown>;
  },
) {
  const { route, open, back } = useStudioNavigation(s.id);
  const employer =
    s.people.find((p) => p.id === s.actorId)?.accessRole === "employer";
  const projects = studioProjects(s);
  useEffect(() => {
    const select = (event: Event) => {
      const { id, filter, projectId, tab } = (event as CustomEvent).detail;
      const person = s.people.find((p) => p.id === id);
      const assignment = s.projects.find((p) =>
        p.workerId === id &&
        (projectId
          ? p.id === projectId
          : filter === "attention"
          ? p.invoices.some((i) => invoiceAttention(i, todayIn(s.timezone)))
          : filter === "completed"
          ? p.state === "accepted"
          : true)
      );
      if (!person || !assignment) return;
      open({
        projectId: assignment.parentProjectId ?? assignment.id,
        role: person.role,
        memberId: id,
        ...(projectId || filter === "attention"
          ? {
            taskId: assignment.id,
            tab: filter === "attention" ? "payments" : tab,
          }
          : {}),
      });
    };
    window.addEventListener("crewcanvas:open-work", select);
    return () => window.removeEventListener("crewcanvas:open-work", select);
  }, [s, open]);
  const project = projects.find((p) => p.id === route.projectId);
  const role = project?.roles.find((r) => r.name === route.role);
  const member = role?.members.find((m) => m.person.id === route.memberId);
  const task = member?.tasks.find((t) => t.id === route.taskId);
  const [fileId, setFileId] = useState<string | null>(null);
  const file = s.files?.find((f) => f.id === fileId);
  function go(next: StudioRoute) {
    document.dispatchEvent(new Event("crewcanvas:exit-focus"));
    open(next);
  }
  const matching = projects.filter((p) =>
    `${p.title} ${
      p.roles.map((r) =>
        `${r.name} ${
          r.members.map((m) =>
            `${m.person.name} ${m.tasks.map((t) => t.title).join(" ")}`
          ).join(" ")
        }`
      ).join(" ")
    }`.toLowerCase().includes(search.toLowerCase())
  );
  const breadcrumb = [
    project?.title,
    role?.name,
    member?.person.name,
    task?.title,
  ].filter(Boolean).join(" / ");
  return (
    <div className="studio-workspace">
      <div className="studio-heading">
        <div>
          <span className="eyebrow">PROJECT → ROLE → MEMBER → TASKS</span>
          <h2>
            {view === "board"
              ? "Your shared picture of the work."
              : view === "revisions"
              ? "Feedback, with the right context."
              : "Good work starts with your people."}
          </h2>
        </div>
        <div className="button-row">
          {employer && (
            <button
              className="button primary"
              onClick={() => go({ form: true })}
            >
              <Plus size={15} />Add task
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => go({ tools: true })}
          >
            Files & workspace tools
          </button>
        </div>
      </div>
      <WorkspaceAssistant snapshot={s} />
      <Suspense fallback={<p role="status">Opening whiteboard…</p>}>
        {view === "board"
          ? <HierarchyBoard snapshot={s} search={search} onOpen={go} />
          : view === "revisions"
          ? (
            <div className="revisions-members">
              {s.people.filter((person) => person.accessRole === "worker").map(
                (person) => {
                  const assignments = matching.flatMap((p) =>
                    p.tasks.filter((t) => t.workerId === person.id).map((
                      t,
                    ) => ({ task: t, project: p }))
                  );
                  if (!assignments.length) {
                    return null;
                  }
                  return (
                    <section className="studio-project" key={person.id}>
                      <div className="freelancer-heading">
                        <h3>{person.name}</h3>
                        <span>{person.role} · {assignments.length} tasks</span>
                      </div>
                      <div className="studio-task-grid">
                        {assignments.map(({ task, project }) => (
                          <div key={task.id}>
                            <small>
                              {project.title} / {person.role} / {person.name}
                            </small>
                            <TaskCard
                              task={task}
                              revisions
                              onOpen={() =>
                                go({
                                  projectId: project.id,
                                  role: person.role,
                                  memberId: person.id,
                                  taskId: task.id,
                                })}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                },
              )}
            </div>
          )
          : (
            <div className="studio-project-grid">
              {matching.map((p) => (
                <section className="studio-project" key={p.id}>
                  <button
                    className="project-title-link"
                    onClick={() =>
                      go({ projectId: p.id })}
                  >
                    {p.title}
                    <ArrowUpRight size={18} />
                  </button>
                  <p>
                    {p.roles.length} roles · {new Set(p.tasks.map((t) =>
                      t.workerId
                    )).size} members · {p.tasks.length} tasks
                  </p>
                  <div className="studio-counts">
                    {(["in_progress", "submitted", "accepted"] as const).map((
                      state,
                    ) => (
                      <span className={`pill work-${state}`} key={state}>
                        {state === "in_progress"
                          ? p.tasks.filter((t) =>
                            ["in_progress", "changes_requested"].includes(
                              t.state,
                            )
                          ).length
                          : p.tasks.filter((t) => t.state === state).length}
                        {" "}
                        {taskLabels[state]}
                      </span>
                    ))}
                  </div>
                  {p.roles.map((r) => (
                    <div className="studio-role" key={r.name}>
                      <button
                        className="text-button"
                        onClick={() => go({ projectId: p.id, role: r.name })}
                      >
                        {r.name} →
                      </button>
                      {r.members.map((m) => (
                        <button
                          className="studio-member"
                          aria-label={`Open member ${m.person.name}`}
                          key={m.person.id}
                          onClick={() =>
                            go({
                              projectId: p.id,
                              role: r.name,
                              memberId: m.person.id,
                            })}
                        >
                          <strong>{m.person.name}</strong>
                          <span>{m.tasks.length} tasks →</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
      </Suspense>
      {!matching.length && (
        <p className="empty-state">
          {search
            ? "No matching work."
            : "Create a project or invite a member to get started."}
        </p>
      )}
      {route.form
        ? (
          <TaskForm
            snapshot={s}
            workerId={member?.person.id}
            parentProjectId={project?.id}
            onClose={back}
            onSubmit={onCommand}
          />
        )
        : task
        ? (
          <ProjectDrawer
            person={member!.person}
            snapshot={s}
            initialFilter="all"
            initialProjectId={task.id}
            initialTab={route.tab ??
              (view === "revisions" ? "revisions" : "overview")}
            onClose={back}
            onBack={back}
            breadcrumb={breadcrumb}
            onCommand={onCommand}
            onIssue={onIssue}
            onRefresh={onRefresh}
            busy={busy}
            onNotify={notify}
          />
        )
        : route.tools
        ? (
          <Modal
            wide
            title={project
              ? `${project.title} · whiteboard tools`
              : "Files & workspace tools"}
            description={breadcrumb || "Files, activity and team organization"}
            onClose={back}
          >
            <button className="text-button" onClick={back}>← Back</button>
            <Suspense fallback={<p>Opening tools…</p>}>
              <ProjectBoard
                snapshot={project ? { ...s, projects: project.tasks } : s}
                onOpen={(workerId, _, id) => {
                  const t = s.projects.find((p) => p.id === id);
                  const parent = projects.find((p) =>
                    p.tasks.some((t) => t.id === id)
                  );
                  const person = s.people.find((p) => p.id === workerId);
                  if (t && parent && person) {
                    go({
                      projectId: parent.id,
                      role: person.role,
                      memberId: workerId,
                      taskId: id,
                    });
                  }
                }}
                notify={notify}
              />
            </Suspense>
            <h3>Workspace files</h3>
            <FilePicker
              snapshot={s}
              projectId={employer ? null : s.projects[0]?.id}
            />
            <div className="studio-file-list">
              {s.files?.map((f) => (
                <button
                  className="button secondary"
                  key={f.id}
                  onClick={() => setFileId(f.id)}
                >
                  {f.name} · v{f.versions.length}
                </button>
              ))}
            </div>
            {file && (
              <FileInspector
                key={`${file.id}-${file.version}`}
                file={file}
                snapshot={s}
                onClose={() => setFileId(null)}
                onNotify={notify}
              />
            )}
            {employer && (
              <StudioOrganization snapshot={s} onSave={onSaveLayout} />
            )}
            <details>
              <summary>Activity timeline</summary>
              {[
                ...(s.workspaceActivity ?? []),
                ...s.projects.flatMap((p) => p.activity),
              ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((
                event,
              ) => (
                <p key={event.id}>
                  {event.text}
                  <small>
                    · {new Date(event.createdAt).toLocaleString(undefined, {
                      timeZone: s.timezone,
                    })}
                  </small>
                </p>
              ))}
            </details>
          </Modal>
        )
        : project
        ? (
          <Modal
            wide
            title={member
              ? `${member.person.name}'s tasks`
              : role
              ? `${role.name} · members`
              : project.title}
            description={breadcrumb}
            onClose={back}
          >
            <button className="text-button" onClick={back}>
              ← Back{member
                ? " to role members"
                : role
                ? " to project roles"
                : " to projects"}
            </button>
            {member
              ? (
                <>
                  <div className="studio-heading">
                    <h3>{member.person.name} · {role!.name}</h3>
                    {employer && (
                      <button
                        className="button primary"
                        onClick={() => go({ ...route, form: true })}
                      >
                        <Plus size={15} />Add task
                      </button>
                    )}
                  </div>
                  <div className="studio-task-grid">
                    {member.tasks.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        onOpen={() => go({ ...route, taskId: t.id })}
                      />
                    ))}
                  </div>
                </>
              )
              : role
              ? role.members.map((m) => (
                <button
                  className="studio-member"
                  aria-label={`Open member ${m.person.name}`}
                  key={m.person.id}
                  onClick={() => go({ ...route, memberId: m.person.id })}
                >
                  <strong>{m.person.name}</strong>
                  <span>{m.tasks.length} tasks →</span>
                </button>
              ))
              : (
                <>
                  <h3>Project roles</h3>
                  {project.roles.map((r) => (
                    <button
                      className="studio-member"
                      aria-label={`Open role ${r.name}`}
                      key={r.name}
                      onClick={() =>
                        go({ projectId: project.id, role: r.name })}
                    >
                      <strong>{r.name}</strong>
                      <span>{r.members.length} members →</span>
                    </button>
                  ))}
                  <button
                    className="button secondary"
                    onClick={() => go({ ...route, tools: true })}
                  >
                    <PenTool size={15} />Open saved whiteboard tools
                  </button>
                </>
              )}
          </Modal>
        )
        : null}
    </div>
  );
}
