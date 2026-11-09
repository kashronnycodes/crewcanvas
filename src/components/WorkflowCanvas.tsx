import { useEffect, useMemo, useState } from "react";
import {
  Background,
  type Node,
  type NodeProps,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { ArrowLeft, ArrowRight, Plus, Users, X } from "lucide-react";
import type {
  CanvasLayout,
  Project,
  WorkflowCollection,
  WorkspaceSnapshot,
} from "../../shared/types";
import type { Command } from "../../shared/validation";
import {
  collectionTasks,
  draftTaskCopy,
  type HierarchyCard,
  workflowCollections,
  workflowGraph,
} from "../../shared/workflow";
import type { StudioRoute } from "../studioNavigation";
import { taskLabels } from "../../shared/studio";
import { Board } from "./ProjectBoard";
import ProjectForm from "./ProjectForm";
import Avatar from "./Avatar";
import Modal from "./Modal";
import FocusCanvas from "./FocusCanvas";
import HierarchyCardView from "./HierarchyCard";

function Tile({ data }: NodeProps<Node<{ card: HierarchyCard }>>) {
  return <HierarchyCardView card={data.card} />;
}
const tileTypes = { hierarchy: Tile };
export default function WorkflowCanvas(
  {
    snapshot: s,
    onSave,
    onOpen,
    onCommand,
    onInvite,
    notify,
    navigation,
    search = "",
    detailedByDefault = false,
    detailsOpen = false,
    onDismissDetails,
  }: {
    snapshot: WorkspaceSnapshot;
    onSave: (layout: CanvasLayout) => Promise<CanvasLayout | undefined>;
    onOpen: (
      workerId: string,
      filter?: "all",
      projectId?: string,
      tab?: "overview" | "deliverables" | "revisions",
    ) => void;
    onCommand: (command: Command) => Promise<boolean>;
    onInvite: (role?: string) => void;
    notify: (text: string) => void;
    navigation: {
      route: StudioRoute;
      open: (route: StudioRoute) => void;
      back: () => void;
      close: () => void;
    };
    search?: string;
    detailedByDefault?: boolean;
    detailsOpen?: boolean;
    onDismissDetails?: () => void;
  },
) {
  const collections = workflowCollections(s);
  const employer =
    s.people.find((p) => p.id === s.actorId)?.accessRole === "employer";
  const [collectionId, setCollectionId] = useState(collections[0]?.id ?? "");
  const collection =
    collections.find((c) => c.id === navigation.route.projectId) ??
      collections.find((c) => c.id === collectionId) ??
      collections[0];
  const tasks = collectionTasks(s, collection.id);
  const [activeId, setActiveId] = useState("");
  const active = tasks.find((p) => p.id === activeId) ?? tasks[0];
  const routeRole = collection.roles.find((r) =>
    r.id === navigation.route.role || r.name === navigation.route.role
  );
  const panel = routeRole
    ? { roleId: routeRole.id, memberId: navigation.route.memberId }
    : null;
  function setPanel(next: { roleId: string; memberId?: string } | null) {
    if (next) {
      navigation.open({
        projectId: collection.id,
        role: next.roleId,
        ...(next.memberId ? { memberId: next.memberId } : {}),
      });
    } else navigation.close();
  }
  const [taskForm, setTaskForm] = useState<
    {
      roleId: string;
      memberId?: string;
      memberSpecific?: boolean;
      draft?: ReturnType<typeof draftTaskCopy>;
    } | null
  >(null);
  const [dialog, setDialog] = useState<"project" | "role" | "member" | null>(
    null,
  );
  const [name, setName] = useState(""), [memberId, setMemberId] = useState("");
  const [saving, setSaving] = useState(false);
  const directory = navigation.route.projectId === collection.id &&
    !navigation.route.role && !navigation.route.taskId &&
    !navigation.route.form;
  function setDirectory(value: boolean) {
    if (value) navigation.open({ projectId: collection.id });
    else if (directory) navigation.close();
  }
  const [detailed, setDetailed] = useState(detailedByDefault);
  useEffect(() => setDetailed(detailedByDefault), [detailedByDefault]);
  const role = collection.roles.find((r) => r.id === panel?.roleId);
  const member = s.people.find((p) => p.id === panel?.memberId);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" && !detailsOpen &&
        !(event.target as HTMLElement).closest(".modal-content")
      ) {
        navigation.back();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [detailsOpen]);
  async function save(next: WorkflowCollection[]) {
    if (saving) return false;
    setSaving(true);
    try {
      return !!await onSave({ ...s.layout, workflow: next });
    } catch (e) {
      notify((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function addTask(
    member?: string,
    requestedRole?: string,
    copy?: Project,
  ) {
    document.dispatchEvent(new Event("crewcanvas:exit-focus"));
    const r = collection.roles.find((r) => r.id === requestedRole) ??
      collection.roles.find((r) => r.members.length);
    if (!r?.members.length) {
      notify("Add a freelancer to a role before assigning a task.");
      return;
    }
    if (!s.layout.workflow && !await save(collections)) return;
    setTaskForm({
      roleId: r.id,
      memberId: member,
      memberSpecific: !!member,
      draft: copy ? draftTaskCopy(copy) : undefined,
    });
    navigation.open({ ...navigation.route, form: true });
  }
  function open(kind: HierarchyCard["kind"], id: string) {
    document.dispatchEvent(new Event("crewcanvas:exit-focus"));
    if (kind === "project" || kind === "roles") {
      navigation.open({ projectId: collection.id });
    } else if (kind === "role") {
      navigation.open({ projectId: collection.id, role: id });
    } else if (kind === "member") {
      const [roleId, memberId] = id.split(":");
      navigation.open({ projectId: collection.id, role: roleId, memberId });
    } else {
      const task = tasks.find((t) => t.id === id);
      const role = collection.roles.find((r) =>
        task?.organization
          ? r.id === task.organization.roleId
          : r.members.includes(task?.workerId ?? "")
      );
      if (task && role) {
        setActiveId(id);
        navigation.open({
          projectId: collection.id,
          role: role.id,
          memberId: task.workerId,
          taskId: id,
          tab: "deliverables",
        });
      }
    }
  }
  // Rebuild graph data, not the canvas instance, when authorized snapshots change.
  const graph = useMemo(
    () => workflowGraph(s, collection, open, { detailed }),
    [
      s,
      collection.id,
      JSON.stringify(collection.roles),
      detailed,
    ],
  );
  return (
    <section
      className="workflow-studio"
      aria-label="Project collaboration studio"
    >
      <header className="workflow-heading">
        <div>
          <span className="eyebrow">PROJECT / ROLES / PEOPLE / WORK</span>
          <h2>A place for every moving part.</h2>
        </div>
        <div className="button-row">
          <label>
            Project<select
              aria-label="Studio project"
              value={collection.id}
              onChange={(e) => {
                setCollectionId(e.target.value);
                if (navigation.route.projectId) navigation.close();
              }}
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </select>
          </label>
          {employer && (
            <>
              <button
                className="button secondary"
                onClick={() => {
                  setName("");
                  setDialog("project");
                }}
              >
                <Plus size={14} /> New board project
              </button>
              <button
                className="button secondary"
                onClick={() => {
                  setName("");
                  setDialog("role");
                }}
              >
                + Add role
              </button>
              <button className="button primary" onClick={() => void addTask()}>
                + Add task
              </button>
            </>
          )}
        </div>
      </header>
      <nav className="workflow-mobile-outline" aria-label="Project roles">
        {collection.roles.map((r) => (
          <button
            key={r.id}
            aria-label={`Open role ${r.name}`}
            onClick={() => open("role", r.id)}
          >
            {r.name} <span>{r.members.length}</span>
          </button>
        ))}
      </nav>
      <div className="workflow-scope">
        <span>
          <Users size={14} /> {collection.roles.length} roles · {tasks.length}
          {" "}
          tasks · Automatically arranged
        </span>
        <button
          className="text-button map-detail-toggle"
          aria-pressed={detailed}
          onClick={() => setDetailed(!detailed)}
        >
          {detailed ? "Show role overview" : "Show task map"}
        </button>
        {active && (
          <label>
            Whiteboard notes for<select
              aria-label="Task whiteboard"
              value={active.id}
              onChange={(e) => setActiveId(e.target.value)}
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="workflow-permission">
        Task details, files and annotations are private to their client and
        assigned freelancer. Role labels never change access.
      </p>
      {active
        ? (
          <FocusCanvas>
            <ReactFlowProvider>
              <Board
                key={`${s.actorId}:${active.id}`}
                snapshot={s}
                projectId={active.id}
                hierarchy={graph}
                onAddTask={employer ? () => void addTask() : undefined}
                onDuplicateTask={employer
                  ? (p) => void addTask(p.workerId, p.organization?.roleId, p)
                  : undefined}
                openProject={() => open("task", active.id)}
                notify={notify}
              />
            </ReactFlowProvider>
          </FocusCanvas>
        )
        : (
          <div className="workflow-empty-canvas">
            <ReactFlow
              nodes={graph.cards.map((card) => ({
                id: card.id,
                type: "hierarchy",
                position: { x: card.x, y: card.y },
                data: { card },
                style: { width: 260, height: 140 },
                draggable: false,
                connectable: false,
              }))}
              edges={graph.edges.map((e) => ({ ...e, type: "smoothstep" }))}
              nodeTypes={tileTypes}
              fitView
              fitViewOptions={{ maxZoom: 1, padding: .2 }}
              nodesDraggable={false}
              nodesConnectable={false}
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} />
            </ReactFlow>
            <div className="workflow-first-task">
              <p>
                Add members to a role, then create your first task. Whiteboard
                tools become available with a task.
              </p>
              {employer && (
                <button
                  className="button primary"
                  onClick={() => void addTask()}
                >
                  + Add task
                </button>
              )}
            </div>
          </div>
        )}
      {directory && !detailsOpen && !navigation.route.form && (
        <aside className="workflow-panel" aria-label="Project roles directory">
          <div className="section-heading">
            <span className="eyebrow">PROJECT / ROLES</span>
            <button
              aria-label="Close roles directory"
              onClick={() =>
                setDirectory(false)}
            >
              <X size={18} />
            </button>
          </div>
          <button className="text-button" onClick={navigation.back}>
            ← Back to project canvas
          </button>
          <h2>{collection.title}</h2>
          <p className="muted">
            Choose a role to see its members and assigned work.
          </p>
          {collection.roles.map((r) => (
            <button
              key={r.id}
              className="role-directory-item"
              onClick={() => open("role", r.id)}
            >
              <span>
                {r.name}
                <small>{r.members.length} members</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
          {employer && (
            <button
              className="button primary"
              onClick={() => {
                setName("");
                setDialog("role");
              }}
            >
              + Add role
            </button>
          )}
        </aside>
      )}
      {panel && role && !detailsOpen && !navigation.route.form && (
        <aside
          className="workflow-panel"
          aria-label={panel.memberId ? "Member tasks" : "Role roster"}
        >
          <div className="section-heading">
            <span className="eyebrow">
              {panel.memberId ? "MEMBER / ASSIGNED WORK" : "ROLE / ROSTER"}
            </span>
            <button aria-label="Close roster" onClick={() => setPanel(null)}>
              <X size={18} />
            </button>
          </div>
          {member
            ? (
              <div className="member-identity">
                <button
                  className="text-button"
                  onClick={navigation.back}
                >
                  <ArrowLeft size={15} /> Back to role roster
                </button>
                <Avatar person={member} size={64} />
                <h2>{member.name}</h2>
              </div>
            )
            : (
              <>
                <button className="text-button" onClick={navigation.back}>
                  ← Back to project roles
                </button>
                <span className="context-step">01 / PEOPLE</span>
                <h2>{role.name}</h2>
                <p className="muted">Select a member to see their work.</p>
              </>
            )}
          {panel.memberId
            ? (
              <>
                <p className="muted">{collection.title} · {role.name}</p>
                {tasks.filter((p) =>
                  `${p.title} ${p.agreements.at(-1)?.brief ?? ""}`.toLowerCase()
                    .includes(search.toLowerCase()) &&
                  p.workerId === panel.memberId &&
                  (!p.organization || p.organization.roleId === role.id)
                ).map((p) => (
                  <article className="member-task" key={p.id}>
                    <button onClick={() => open("task", p.id)}>
                      <strong>{p.title}</strong>
                      <ArrowRight size={15} />
                    </button>
                    <p>
                      <span className={`pill work-${p.state}`}>
                        {taskLabels[p.state]}
                      </span>
                    </p>
                    {employer && (
                      <button
                        className="text-button"
                        onClick={() => void addTask(p.workerId, role.id, p)}
                      >
                        Duplicate as draft
                      </button>
                    )}
                  </article>
                ))}
                {employer && (
                  <button
                    className="button primary"
                    onClick={() => void addTask(panel.memberId, role.id)}
                  >
                    + Add task
                  </button>
                )}
              </>
            )
            : (
              <>
                <div className="roster-grid">
                  {role.members.map((id) => s.people.find((p) => p.id === id))
                    .filter((p) => !!p).map((p) => (
                      <button
                        className="roster-member"
                        key={p.id}
                        onClick={() =>
                          setPanel({ roleId: role.id, memberId: p.id })}
                      >
                        <Avatar person={p} size={60} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{role.name}</small>
                        </span>
                      </button>
                    ))}
                  {employer && (
                    <button
                      className="roster-add"
                      aria-label="+ Add member"
                      onClick={() => {
                        setMemberId("");
                        setDialog("member");
                      }}
                    >
                      <span>
                        <Plus size={24} />
                      </span>
                      <strong>Add member</strong>
                    </button>
                  )}
                </div>
                {!role.members.length && (
                  <p className="muted">
                    No members yet. Add someone from your workspace or invite a
                    freelancer.
                  </p>
                )}
                {employer && (
                  <>
                    <button
                      className="button secondary"
                      onClick={() => onInvite(role.name)}
                    >
                      Invite new member
                    </button>
                  </>
                )}
              </>
            )}
        </aside>
      )}
      {dialog && (
        <Modal
          title={dialog === "project"
            ? "Create board project"
            : dialog === "role"
            ? "Add project role"
            : "Add member to role"}
          description="Organize the work. Existing account permissions stay in effect."
          onClose={() => setDialog(null)}
        >
          <form
            className="stacked-form"
            onSubmit={async (e) => {
              e.preventDefault();
              let next = collections;
              if (dialog === "project") {
                const id = crypto.randomUUID();
                next = [...collections, {
                  id,
                  title: name.trim(),
                  roles: ["Editor", "Thumbnail Designer", "Scriptwriter"].map(
                    (name) => ({ id: crypto.randomUUID(), name, members: [] }),
                  ),
                }];
                if (await save(next)) {
                  setCollectionId(id);
                  setDialog(null);
                  setPanel(null);
                }
              } else if (dialog === "role") {
                const id = crypto.randomUUID();
                next = collections.map((c) =>
                  c.id === collection.id
                    ? {
                      ...c,
                      roles: [...c.roles, {
                        id,
                        name: name.trim(),
                        members: [],
                      }],
                    }
                    : c
                );
                if (await save(next)) {
                  setDialog(null);
                  setPanel({ roleId: id });
                }
              } else if (role && memberId) {
                next = collections.map((c) =>
                  c.id === collection.id
                    ? {
                      ...c,
                      roles: c.roles.map((r) =>
                        r.id === role.id
                          ? {
                            ...r,
                            members: [...new Set([...r.members, memberId])],
                          }
                          : r
                      ),
                    }
                    : c
                );
                if (await save(next)) setDialog(null);
              }
            }}
          >
            {dialog === "member"
              ? (
                <label>
                  Workspace freelancer<select
                    value={memberId}
                    required
                    onChange={(e) => setMemberId(e.target.value)}
                  >
                    <option value="">Choose a member</option>
                    {s.people.filter((p) =>
                      p.accessRole === "worker" && !role?.members.includes(p.id)
                    ).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
              )
              : (
                <label>
                  {dialog === "project" ? "Project title" : "Role name"}
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    maxLength={dialog === "project" ? 120 : 60}
                  />
                </label>
              )}
            <p className="muted">
              Organizing people here does not grant access to another
              freelancer’s tasks or payments.
            </p>
            <button className="button primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        </Modal>
      )}
      {taskForm && navigation.route.form && (
        <ProjectForm
          people={s.people}
          task={{ collection, collections, ...taskForm }}
          onClose={() => {
            setTaskForm(null);
            navigation.back();
          }}
          onSubmit={onCommand}
          onEnsureMember={async (collectionId, roleId, memberId) => {
            const current = collections.find((c) => c.id === collectionId)
              ?.roles.find((r) => r.id === roleId);
            if (!current) return false;
            if (current?.members.includes(memberId)) return true;
            return save(collections.map((c) =>
              c.id === collectionId
                ? {
                  ...c,
                  roles: c.roles.map((r) =>
                    r.id === roleId
                      ? { ...r, members: [...r.members, memberId] }
                      : r
                  ),
                }
                : c
            ));
          }}
        />
      )}
    </section>
  );
}
