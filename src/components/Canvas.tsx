import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Handle,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Expand,
  Hand,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Pencil,
  Plus,
  Users,
  X,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import type {
  CanvasLayout,
  Person,
  Project,
  WorkspaceSnapshot,
} from "../../shared/types";
import { indicators, reparent, todayIn, uid } from "../../shared/domain";
import Avatar from "./Avatar";
import {
  useWorkspaceCanvas,
  WorkCard,
  type WorkCardData,
} from "./IntelligentCanvas";
type Filter = "all" | "attention" | "completed";
type MapData = {
  work?: WorkCardData;
  person?: Person;
  projects: Project[];
  people: Person[];
  name?: string;
  collapsed?: boolean;
  today: string;
  onSelect: (id: string, filter?: Filter) => void;
  onToggle?: () => void;
  onRename?: () => void;
  onMembers?: (filter?: Filter) => void;
};
type MapNode = Node<MapData>;
export function StatusBadges({
  projects,
  workerIds,
  today,
  onClick,
}: {
  projects: Project[];
  workerIds: string[];
  today: string;
  onClick: (filter: Filter) => void;
}) {
  const counts = indicators(projects, workerIds, today);
  return (
    <div className="status-badges">
      {counts.attention > 0 && (
        <button
          className="status-badge red nodrag"
          title={`${counts.attention} project${
            counts.attention > 1 ? "s" : ""
          } need payment attention`}
          aria-label={`${counts.attention} projects need payment attention`}
          onClick={(e) => {
            e.stopPropagation();
            onClick("attention");
          }}
        >
          <AlertCircle size={13} />
          {counts.attention}
        </button>
      )}
      {counts.completed > 0 && (
        <button
          className="status-badge green nodrag"
          title={`${counts.completed} accepted project${
            counts.completed > 1 ? "s" : ""
          }`}
          aria-label={`${counts.completed} accepted projects`}
          onClick={(e) => {
            e.stopPropagation();
            onClick("completed");
          }}
        >
          <Check size={13} />
          {counts.completed}
        </button>
      )}
    </div>
  );
}
function PersonNode({ data }: NodeProps<MapNode>) {
  const p = data.person!;
  const lead = p.accessRole === "employer";
  const own = data.projects.filter((x) => x.workerId === p.id);
  return (
    <div className={`person-node ${lead ? "lead-node" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <button
        className="person-open"
        title="Click to view projects · drag to rearrange"
        aria-label={lead ? "Myron, team lead" : `Open ${p.name}`}
        onClick={() => !lead && data.onSelect(p.id)}
      >
        <div className="avatar-frame">
          <Avatar person={p} size={lead ? 86 : 76} />
          {lead && <span className="lead-star">✦</span>}
          <i className="presence-dot" />
        </div>
        <strong>{p.name}</strong>
        <span className="person-role">{p.role}</span>
      </button>
      {lead ? <span className="lead-tag">WORKSPACE OWNER</span> : (
        <>
          <span className="person-projects">
            {own.length} {own.length === 1 ? "project" : "projects"}
            <span>·</span>
            {own.some((x) => x.state === "submitted")
              ? "Review ready"
              : own.some((x) => x.state === "accepted")
              ? "Work accepted"
              : "In progress"}
          </span>
          <StatusBadges
            projects={data.projects}
            workerIds={[p.id]}
            today={data.today}
            onClick={(filter) => data.onSelect(p.id, filter)}
          />
        </>
      )}
      {!lead && (
        <button
          className="node-menu nodrag"
          title={`View ${p.name}'s projects`}
          onClick={() => data.onSelect(p.id)}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
    </div>
  );
}
function GroupNode({ data }: NodeProps<MapNode>) {
  return (
    <div className={`group-node ${data.collapsed ? "collapsed" : "expanded"}`}>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
      <div className="group-heading">
        <span className="group-symbol">
          <Users size={15} />
        </span>
        <strong>{data.name}</strong>
        <span className="member-count">{data.people.length}</span>
        <button
          className="icon-button nodrag group-rename"
          aria-label={`Rename ${data.name}`}
          onClick={data.onRename}
        >
          <Pencil size={12} />
        </button>
        <button
          className="icon-button nodrag"
          aria-label={`${data.collapsed ? "Expand" : "Collapse"} ${data.name}`}
          onClick={data.onToggle}
        >
          {data.collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>
      {data.collapsed && (
        <>
          <button
            className="group-preview nodrag"
            onClick={() => data.onMembers?.("all")}
            title="View group members"
          >
            <div className="avatar-stack">
              {data.people.slice(0, 4).map((p) => (
                <Avatar key={p.id} person={p} size={40} />
              ))}
            </div>
            <span>{data.people.length} creative minds</span>
          </button>
          <div className="group-footer">
            <span>View team</span>
            <StatusBadges
              projects={data.projects}
              workerIds={data.people.map((p) =>
                p.id
              )}
              today={data.today}
              onClick={(filter) => data.onMembers?.(filter)}
            />
          </div>
        </>
      )}
    </div>
  );
}
const nodeTypes = { person: PersonNode, group: GroupNode, work: WorkCard };
function Map({
  snapshot,
  onSelect,
  onSave,
  saveStatus,
  search,
  onNotify,
  onInvite,
  selectedPersonId,
}: {
  snapshot: WorkspaceSnapshot;
  onSelect: (id: string, filter?: Filter, projectId?: string) => void;
  onSave: (layout: CanvasLayout) => Promise<CanvasLayout>;
  saveStatus: string;
  search: string;
  onNotify: (s: string) => void;
  onInvite: () => void;
  selectedPersonId?: string;
}) {
  const [layout, setLayout] = useState(snapshot.layout);
  const [pan, setPan] = useState(false);
  const [groupEditor, setGroupEditor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<Filter>("all");
  const flow = useReactFlow();
  const pendingWrites = useRef(0), generation = useRef(0);
  const initialized = useNodesInitialized(),
    initialViewSet = useRef(snapshot.layout.version !== 0);
  useEffect(() => {
    if (!pendingWrites.current) setLayout(snapshot.layout);
  }, [snapshot.layout]);
  const persist = useCallback(
    (next: CanvasLayout) => {
      setLayout(next);
      pendingWrites.current++;
      const token = ++generation.current;
      void onSave(next)
        .then((saved) => {
          if (token === generation.current) setLayout(saved);
        })
        .catch(() => {})
        .finally(() => pendingWrites.current--);
    },
    [onSave],
  );
  const today = todayIn(snapshot.timezone);
  const workspace = useWorkspaceCanvas({
    snapshot,
    layout,
    persist,
    flow,
    onSelect,
    onNotify,
  });
  useEffect(() => {
    if (!initialized || initialViewSet.current) return;
    initialViewSet.current = true;
    void flow.fitView({
      nodes: [
        { id: `task:${snapshot.projects[0]?.id}` },
        { id: `payment:${snapshot.projects[0]?.id}` },
        ...(snapshot.projects[0]?.deliveries.map((d) => ({
          id: `delivery:${d.id}`,
        })) ?? []),
      ],
      padding: 0.3,
      maxZoom: 0.9,
    });
  }, [initialized, flow, snapshot.projects]);
  const nodes: MapNode[] = useMemo(() => {
    const groups: MapNode[] = layout.groups.map((g) => ({
      id: g.id,
      type: "group",
      position: { x: g.x, y: g.y },
      style: {
        width: g.collapsed ? 295 : g.width,
        height: g.collapsed ? 183 : g.height,
      },
      data: {
        name: g.name,
        collapsed: g.collapsed,
        projects: snapshot.projects,
        people: snapshot.people.filter((p) =>
          layout.people.some((l) => l.id === p.id && l.groupId === g.id)
        ),
        today,
        onSelect,
        onToggle: () =>
          persist({
            ...layout,
            groups: layout.groups.map((x) =>
              x.id === g.id ? { ...x, collapsed: !x.collapsed } : x
            ),
          }),
        onRename: () => {
          setName(g.name);
          setGroupEditor(g.id);
        },
        onMembers: (filter = "all") => {
          setGroupFilter(filter);
          setGroupMembers(g.id);
        },
      },
    }));
    const persons: MapNode[] = layout.people.flatMap((position) => {
      const person = snapshot.people.find((p) => p.id === position.id);
      if (!person) return [];
      const hidden = !!position.groupId &&
        !!layout.groups.find((g) => g.id === position.groupId)?.collapsed;
      return [
        {
          id: person.id,
          selected: person.id === selectedPersonId,
          type: "person",
          parentId: position.groupId ?? undefined,
          position: { x: position.x, y: position.y },
          hidden,
          style: {
            width: 170,
            opacity: search &&
                !`${person.name} ${person.role} ${
                  snapshot.projects
                    .filter((p) => p.workerId === person.id)
                    .map((p) => p.title)
                    .join(" ")
                }`
                  .toLowerCase()
                  .includes(search.toLowerCase()) &&
                person.accessRole !== "employer"
              ? 0.24
              : 1,
          },
          data: {
            person,
            people: snapshot.people,
            projects: snapshot.projects,
            today,
            onSelect: workspace.selectPerson,
          },
        },
      ];
    });
    return [
      ...groups,
      ...persons,
      ...workspace.workNodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          projects: snapshot.projects,
          people: snapshot.people,
          today,
          onSelect,
        },
      })),
    ];
  }, [
    layout,
    snapshot.people,
    snapshot.projects,
    onSelect,
    persist,
    search,
    today,
    selectedPersonId,
    workspace.workNodes,
  ]);
  const edges = useMemo(() => {
    const employer = snapshot.people.find((p) => p.accessRole === "employer")!;
    return [
      ...layout.groups.map((g) => ({
        id: `owner-${g.id}`,
        source: employer.id,
        target: g.id,
      })),
      ...layout.people
        .filter((p) => p.id !== employer.id)
        .map((p) => ({
          id: `link-${p.id}`,
          source: p.groupId ?? employer.id,
          target: p.id,
          hidden: !!p.groupId &&
            !!layout.groups.find((g) => g.id === p.groupId)?.collapsed,
        })),
    ].map((e) => ({
      ...e,
      type: "default",
      zIndex: 0,
      style: { stroke: "var(--line, #555c59)", strokeWidth: 1.2 },
    }));
  }, [layout, snapshot.people]);
  function changed(changes: NodeChange<MapNode>[]) {
    setLayout((current) => {
      let next = current;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          const { x, y } = change.position;
          next = {
            ...next,
            people: next.people.map((p) =>
              p.id === change.id ? { ...p, x, y } : p
            ),
            groups: next.groups.map((g) =>
              g.id === change.id ? { ...g, x, y } : g
            ),
            cards: workspace.workNodes.some((n) => n.id === change.id)
              ? [...(next.cards ?? []).filter((c) => c.id !== change.id), {
                ...next.cards?.find((c) => c.id === change.id),
                id: change.id,
                x,
                y,
              }]
              : next.cards,
          };
        } else if (
          change.type === "dimensions" && change.resizing && change.dimensions
        ) {
          const node = workspace.workNodes.find((n) => n.id === change.id);
          if (node?.data.work.kind === "file") {
            next = {
              ...next,
              cards: [...(next.cards ?? []).filter((c) => c.id !== change.id), {
                id: change.id,
                ...node.position,
                ...next.cards?.find((c) => c.id === change.id),
                width: change.dimensions.width,
                height: change.dimensions.height,
              }],
            };
          }
        }
      }
      return next;
    });
  }
  function addGroup() {
    if (!name.trim()) return;
    const id = uid();
    persist({
      ...layout,
      groups: [
        ...layout.groups,
        {
          id,
          name: name.trim(),
          x: 550,
          y: 650,
          width: 460,
          height: 280,
          collapsed: false,
        },
      ],
    });
    setGroupEditor(null);
    setTimeout(() => void flow.fitView({ padding: 0.2, duration: 300 }), 100);
  }
  const members = snapshot.people.filter(
    (p) =>
      layout.people.some((x) => x.id === p.id && x.groupId === groupMembers) &&
      (groupFilter === "all" ||
        indicators(snapshot.projects, [p.id], today)[
            groupFilter === "attention" ? "attention" : "completed"
          ] > 0),
  );
  return (
    <div
      className="canvas-container"
      ref={workspace.container}
      onDrop={workspace.drop}
      onDragOver={workspace.dragOver}
      onDragLeave={workspace.dragLeave}
      onKeyUp={(e) => {
        if (
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) &&
          e.target instanceof Element && e.target.closest(".react-flow__node")
        ) persist(layout);
      }}
    >
      <ReactFlow<MapNode>
        nodes={nodes.map((n) =>
          n.type === "work" ? n : {
            ...n,
            style: {
              ...n.style,
              opacity: Math.min(
                Number(n.style?.opacity ?? 1),
                workspace.opacity(n.id),
              ),
            },
          }
        )}
        edges={[...edges, ...workspace.workEdges]}
        nodeTypes={nodeTypes}
        onNodesChange={changed}
        onConnect={workspace.connect}
        onNodeClick={(event, node) => workspace.inspect(node.id, event)}
        onEdgeClick={(_, edge) => workspace.edgeClick(edge)}
        onPaneClick={workspace.paneClick}
        onNodeDragStop={(_, node) => {
          const next = {
            ...layout,
            people: layout.people.map((p) =>
              p.id === node.id ? { ...p, ...node.position } : p
            ),
            groups: layout.groups.map((g) =>
              g.id === node.id ? { ...g, ...node.position } : g
            ),
            cards: node.type === "work"
              ? [...(layout.cards ?? []).filter((c) => c.id !== node.id), {
                ...layout.cards?.find((c) => c.id === node.id),
                id: node.id,
                ...node.position,
              }]
              : layout.cards,
          };
          persist(next);
        }}
        onMoveEnd={(_, viewport) => {
          if (initialViewSet.current) persist({ ...layout, viewport });
        }}
        defaultViewport={snapshot.layout.viewport}
        fitView={false}
        minZoom={0.2}
        maxZoom={1.8}
        panOnDrag={pan ? true : [1, 2]}
        selectionOnDrag={!pan}
        nodesConnectable
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.25}
          color="#d6dcd8"
        />
      </ReactFlow>
      {workspace.ui}
      <div className="canvas-hint">
        <span className="live-dot" /> Your team, connected{" "}
        <span>Drag to make it yours</span>
      </div>
      <div className="canvas-tools">
        <button
          className={!pan ? "active" : ""}
          aria-label="Select tool"
          title="Select and drag people"
          onClick={() => setPan(false)}
        >
          <MousePointer2 size={19} />
        </button>
        <button
          className={pan ? "active" : ""}
          aria-label="Pan tool"
          title="Pan canvas"
          onClick={() => setPan(true)}
        >
          <Hand size={19} />
        </button>
        <span className="tool-divider" />
        <button
          title="Add person or group"
          aria-label="Add person or group"
          onClick={() => setAddOpen(!addOpen)}
        >
          <Plus size={21} />
        </button>
      </div>
      {addOpen && (
        <div className="canvas-add popover">
          <button
            onClick={() => {
              setAddOpen(false);
              onInvite();
            }}
          >
            <Plus size={16} /> Add person
          </button>
          <button
            onClick={() => {
              setName("");
              setGroupEditor("new");
              setAddOpen(false);
            }}
          >
            <Users size={16} /> New role group
          </button>
          <button
            onClick={() => {
              setGroupFilter("all");
              setGroupMembers("all");
              setAddOpen(false);
            }}
          >
            <Plus size={16} /> Organize people
          </button>
        </div>
      )}
      <div className="canvas-bottom">
        <div className="legend">
          <span>
            <i className="legend-green" /> Accepted work
          </span>
          <span>
            <i className="legend-red" /> Payment attention
          </span>
          <span className="saved-label">{saveStatus}</span>
        </div>
        <div className="zoom-tools">
          <button
            aria-label="Zoom out"
            onClick={() => void flow.zoomOut({ duration: 150 })}
          >
            <Minus size={16} />
          </button>
          <span>{Math.round(flow.getZoom() * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() => void flow.zoomIn({ duration: 150 })}
          >
            <Plus size={16} />
          </button>
          <span className="tool-divider" />
          <button
            aria-label="Fit to screen"
            title="Fit to screen"
            onClick={() => void flow.fitView({ padding: 0.2, duration: 300 })}
          >
            <Expand size={17} />
          </button>
        </div>
      </div>
      {groupEditor && (
        <div
          className="canvas-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={groupEditor === "new"
            ? "Create role group"
            : "Rename role group"}
        >
          <div>
            <h3>
              {groupEditor === "new"
                ? "A place for your people"
                : "Rename role group"}
            </h3>
            <p>Groups organize your canvas. Access stays the same.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (groupEditor === "new") addGroup();
                else {
                  persist({
                    ...layout,
                    groups: layout.groups.map((g) =>
                      g.id === groupEditor
                        ? { ...g, name: name.trim() || g.name }
                        : g
                    ),
                  });
                  setGroupEditor(null);
                }
              }}
            >
              <label>
                Role group name
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  placeholder="e.g. Motion Designers"
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setGroupEditor(null)}
                >
                  Cancel
                </button>
                <button className="button primary">Save group</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {groupMembers && (
        <div
          className="canvas-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Organize group members"
        >
          <div className="group-members-dialog">
            <button
              className="icon-button close-dialog"
              aria-label="Close group members"
              onClick={() => setGroupMembers(null)}
            >
              <X size={18} />
            </button>
            <h3>
              {groupMembers === "all"
                ? "A place for everyone"
                : layout.groups.find((g) => g.id === groupMembers)?.name}
            </h3>
            <p>
              Choose a person to view their projects, or change their visual
              group.
            </p>
            {(groupMembers === "all"
              ? snapshot.people.filter((p) => p.accessRole === "worker")
              : members).map((p) => (
                <div className="member-row" key={p.id}>
                  <button
                    onClick={() => {
                      onSelect(p.id, groupFilter);
                      setGroupMembers(null);
                    }}
                  >
                    <Avatar person={p} size={36} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.role}</small>
                    </span>
                  </button>
                  <select
                    aria-label={`Group for ${p.name}`}
                    value={layout.people.find((x) => x.id === p.id)?.groupId ??
                      ""}
                    onChange={(e) => {
                      try {
                        persist(reparent(layout, p.id, e.target.value || null));
                      } catch (error) {
                        onNotify((error as Error).message);
                      }
                    }}
                  >
                    <option value="">Ungrouped</option>
                    {layout.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
export default function Canvas(props: Parameters<typeof Map>[0]) {
  return (
    <ReactFlowProvider>
      <Map {...props} />
    </ReactFlowProvider>
  );
}
