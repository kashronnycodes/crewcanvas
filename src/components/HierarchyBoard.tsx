import {
  Background,
  Controls,
  type Edge,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { studioProjects, taskLabels } from "../../shared/studio";
import type { WorkspaceSnapshot } from "../../shared/types";
import FocusCanvas from "./FocusCanvas";
import type { StudioRoute } from "../studioNavigation";

type Card = Node<
  { title: string; label: string; state?: string; open: () => void }
>;
function HierarchyCard({ data }: NodeProps<Card>) {
  return (
    <div className="hierarchy-card">
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <button onClick={data.open}>
        <small>{data.label}</small>
        <strong>{data.title}</strong>
        {data.state && (
          <span className={`pill work-${data.state}`}>
            {taskLabels[data.state as keyof typeof taskLabels]}
          </span>
        )}
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
const nodeTypes = { hierarchy: HierarchyCard };
export default function HierarchyBoard(
  { snapshot, search, onOpen }: {
    snapshot: WorkspaceSnapshot;
    search: string;
    onOpen: (route: StudioRoute) => void;
  },
) {
  const nodes: Card[] = [], edges: Edge[] = [];
  let row = 0;
  function card(
    id: string,
    x: number,
    y: number,
    title: string,
    label: string,
    route: StudioRoute,
    state?: string,
  ) {
    nodes.push({
      id,
      type: "hierarchy",
      position: { x, y },
      data: { title, label, state, open: () => onOpen(route) },
      width: 250,
      height: 122,
      draggable: false,
    });
  }
  function connect(source: string, target: string) {
    edges.push(
      {
        id: `${source}>${target}`,
        source,
        target,
        type: "smoothstep",
        style: { stroke: "var(--text-muted, #858599)", strokeWidth: 1.3 },
        pathOptions: { borderRadius: 12 },
      } as Edge,
    );
  }
  for (const project of studioProjects(snapshot)) {
    if (
      search &&
      !`${project.title} ${
        project.roles.map((r) =>
          `${r.name} ${
            r.members.map((m) =>
              `${m.person.name} ${m.tasks.map((t) => t.title).join(" ")}`
            ).join(" ")
          }`
        ).join(" ")
      }`.toLowerCase().includes(search.toLowerCase())
    ) continue;
    const start = row, pid = `project-${project.id}`;
    for (const role of project.roles) {
      const roleStart = row, rid = `${pid}-role-${role.name}`;
      for (const member of role.members) {
        const memberStart = row, mid = `${rid}-member-${member.person.id}`;
        for (const task of member.tasks) {
          const tid = `task-${task.id}`;
          card(tid, 960, row * 168, task.title, "TASK", {
            projectId: project.id,
            role: role.name,
            memberId: member.person.id,
            taskId: task.id,
          }, task.state);
          connect(mid, tid);
          row++;
        }
        card(
          mid,
          640,
          ((memberStart + row - 1) / 2) * 168,
          member.person.name,
          `MEMBER · ${member.tasks.length} TASKS`,
          {
            projectId: project.id,
            role: role.name,
            memberId: member.person.id,
          },
        );
        connect(rid, mid);
      }
      card(
        rid,
        320,
        ((roleStart + row - 1) / 2) * 168,
        role.name,
        `ROLE · ${role.members.length} MEMBERS`,
        { projectId: project.id, role: role.name },
      );
      connect(pid, rid);
    }
    card(pid, 0, ((start + row - 1) / 2) * 168, project.title, "PROJECT", {
      projectId: project.id,
    });
    row++;
  }
  return (
    <FocusCanvas>
      <div
        className="hierarchy-board"
        aria-label="Project hierarchy whiteboard"
      >
        {nodes.length
          ? (
            <ReactFlow
              key={`${search}-${nodes.length}`}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.2}
              maxZoom={1.5}
              nodesConnectable={false}
              nodesDraggable={false}
              edgesFocusable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
          )
          : <p className="empty-state">No matching projects.</p>}
      </div>
    </FocusCanvas>
  );
}
