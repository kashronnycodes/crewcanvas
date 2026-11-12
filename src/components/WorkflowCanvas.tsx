import { Controls } from "@xyflow/react";
import {
Background,
type Node,
type NodeProps,
ReactFlow,
ReactFlowProvider,
} from "@xyflow/react";
import { ArrowLeft,ArrowRight,Plus,X } from "lucide-react";
import { useEffect,useMemo,useState } from "react";
import type {
CanvasLayout,
WorkflowCollection,
WorkspaceSnapshot,
} from "../../shared/types";
import type { Command } from "../../shared/validation";
import {
collectionTasks,
type HierarchyCard,
workflowCollections,
workflowGraph,
} from "../../shared/workflow";
import type { StudioRoute } from "../studioNavigation";
import Avatar from "./Avatar";
import FocusCanvas from "./FocusCanvas";
import HierarchyCardView from "./HierarchyCard";
import Modal from "./Modal";
import { Board } from "./ProjectBoard";
import ProjectForm from "./ProjectForm";

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
  const [emptyPan, setEmptyPan] = useState(true);
  useEffect(() => setEmptyPan(true), [collection.id]);
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
    } | null
  >(null);
  useEffect(() => {
    if (navigation.route.form && !taskForm) setTaskForm({roleId:routeRole?.id ?? "",memberId:navigation.route.memberId,memberSpecific:!!navigation.route.memberId});
  }, [navigation.route.form, navigation.route.memberId, routeRole?.id]);
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
  ) {
    document.dispatchEvent(new Event("crewcanvas:exit-focus"));
    const r = collection.roles.find((r) => r.id === requestedRole) ??
      collection.roles.find((r) => r.members.length);
    if (!s.layout.workflow && !await save(collections)) return;
    setTaskForm({
      roleId: r?.id ?? "",
      memberId: member,
      memberSpecific: !!member,
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
      navigation.open({projectId:collection.id,role:roleId,memberId});
    } else {
      const task = tasks.find((t) => t.id === id);
      const role = collection.roles.find((r) =>
        task?.organization
          ? r.id === task.organization.roleId
          : r.members.includes(task?.workerId ?? "")
      );
      if (task) {
        navigation.open({
          projectId: collection.id,
          role: role?.id,
          memberId: task.workerId ?? undefined,
          taskId: id,
          tab: "overview",
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
                <Plus size={14} /> New project
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
        <button
          className="text-button map-detail-toggle"
          aria-pressed={detailed}
          onClick={() => setDetailed(!detailed)}
        >
          {detailed ? "Show role overview" : "Show task map"}
        </button>
        {active && (
          <label>
            Notes for task<select
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
        Only the client and the hired freelancer can see task details, files, and notes.
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
              panOnDrag={emptyPan ? true : [1, 2]}
              selectionOnDrag={!emptyPan}
              nodesDraggable={false}
              nodesConnectable={false}
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
            <div className="board-toolbar" aria-label="Whiteboard tools">
              <button aria-label="Pan" aria-pressed={emptyPan} onClick={() => setEmptyPan(true)}>Pan</button>
              <button aria-label="Select" aria-pressed={!emptyPan} onClick={() => setEmptyPan(false)}>Select</button>
            </div>
            <div className="workflow-first-task">
              <p>
                Create a task now and assign someone when ready. Whiteboard
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
            Choose a role to see its members.
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
        <aside className="workflow-panel" aria-label="Role roster">
          <div className="section-heading"><span className="eyebrow">ROLE / ROSTER</span><button aria-label="Close roster" onClick={()=>setPanel(null)}><X size={18}/></button></div>
          <button className="text-button" onClick={navigation.back}>← Back</button>
          <h2>{role.name}</h2><p className="muted">Select a member for their project information.</p>
          <div className="roster-grid">
            {role.members.map(id=>s.people.find(p=>p.id===id)).filter(p=>!!p).map(p=><button className="roster-member" key={p.id} onClick={()=>navigation.open({projectId:collection.id,role:role.id,memberId:p.id})}>
              <Avatar person={p} size={60}/><span><strong>{p.name}{p.sample&&<small className="sample-member-label">Sample</small>}</strong><small>{role.name}</small></span>
            </button>)}
            {employer&&<button className="roster-add" aria-label="+ Add member" onClick={()=>{setMemberId("");setDialog("member");}}><span><Plus size={24}/></span><strong>Add member</strong></button>}
          </div>
          {!role.members.length&&<p className="muted">No members yet.</p>}
          {employer&&<button className="button secondary" onClick={()=>onInvite(role.name)}>Invite new member</button>}
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
                  roles: [],
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
                      <option key={p.id} value={p.id}>{p.name}{p.sample ? " · Sample" : ""}</option>
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
