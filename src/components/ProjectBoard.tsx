import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyNodeChanges,
  Background,
  type Connection,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import {
  ArrowRight,
  Circle,
  Copy,
  FileUp,
  Hand,
  Layers,
  Link2,
  MessageSquare,
  MousePointer2,
  Pencil,
  Redo2,
  Scan,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  boardColors,
  type BoardData,
  boardDataSchema,
  type BoardEdit,
  boardGeometryWrite,
  type BoardObject,
  historyTarget,
  mergeBoardRows,
  newBoardData,
} from "../../shared/board";
import type { WorkspaceSnapshot } from "../../shared/types";
import { activeAgreement } from "../../shared/domain";
import { boardService } from "../boardService";
import { mode, supabase } from "../services";
import { files } from "../fileService";
import { FilePreview } from "./WorkspaceFiles";
import FocusCanvas from "./FocusCanvas";
type BoardNode = Node<
  {
    row: BoardObject;
    onEdit: (id: string) => void;
    onGeometryStart: (row: BoardObject) => void;
    onResize: (
      id: string,
      width: number,
      height: number,
      x: number,
      y: number,
    ) => void;
    file?: NonNullable<WorkspaceSnapshot["files"]>[number];
  }
>;
const ObjectNode = memo(
  function ObjectNode({ data, selected }: NodeProps<BoardNode>) {
    const { row, file } = data, d = row.data;
    const path = d.points.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(
      " ",
    );
    return (
      <article
        className={`board-object board-${d.kind} board-color-${d.color}`}
        style={{
          fontSize: d.fontSize,
          fontWeight: d.bold ? 600 : 400,
          textAlign: d.align,
        }}
        onDoubleClick={() => data.onEdit(row.id)}
      >
        <NodeResizer
          isVisible={selected && d.kind !== "stroke"}
          minWidth={40}
          minHeight={40}
          maxWidth={3000}
          maxHeight={3000}
          onResizeStart={() => data.onGeometryStart(row)}
          onResizeEnd={(_, p) =>
            data.onResize(row.id, p.width, p.height, p.x, p.y)}
        />
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        {d.kind === "stroke"
          ? (
            <svg
              viewBox={`0 0 ${d.width} ${d.height}`}
              preserveAspectRatio="none"
            >
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={d.thickness}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )
          : ["line", "arrow"].includes(d.kind)
          ? (
            <svg viewBox="0 0 240 180" preserveAspectRatio="none">
              <path
                d="M8 170 L224 10"
                fill="none"
                stroke="currentColor"
                strokeWidth={d.thickness}
              />
              {d.kind === "arrow" && (
                <path
                  d="M204 10 L224 10 L224 30"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={d.thickness}
                />
              )}
            </svg>
          )
          : (
            <>
              {d.kind === "file" && file && (
                <div className="board-file-preview nodrag">
                  <FilePreview file={file} />
                </div>
              )}
              {d.kind === "file" && !file && <span>File unavailable</span>}
              <span className="board-object-text">
                {d.text || (d.kind === "text" ? "Double-click to write" : "")}
              </span>
              {d.kind === "link" && d.url && (
                <a
                  className="nodrag"
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Link2 size={14} /> Open reference
                </a>
              )}
            </>
          )}
      </article>
    );
  },
  (a, b) =>
    a.selected === b.selected && a.data.row.version === b.data.row.version &&
    a.data.row.id === b.data.row.id && a.data.file === b.data.file,
);
const nodeTypes = { board: ObjectNode };
type Comment = {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  resolved: boolean;
  created_at: string;
  reply_to: string | null;
};
type Pending = {
  id: string;
  data: BoardData;
  expected: number;
  deleted: boolean;
};

function Board(
  { snapshot: s, projectId, openProject, notify }: {
    snapshot: WorkspaceSnapshot;
    projectId: string;
    openProject: () => void;
    notify: (text: string) => void;
  },
) {
  const flow = useReactFlow<BoardNode>(),
    viewport = useViewport(),
    cache = useQueryClient();
  const project = s.projects.find((p) => p.id === projectId)!,
    agreement = activeAgreement(project);
  const scope = `crewcanvas.board-draft.${s.actorId}.${projectId}`;
  const [rows, setRows] = useState<BoardObject[]>([]), latest = useRef(rows);
  latest.current = rows;
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState("Connecting…"),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [tool, setTool] = useState<"select" | "hand" | "pen" | "eraser">("select");
  const [editor, setEditor] = useState<
    { id: string; data: BoardData; expected: number } | null
  >(null);
  const [undo, setUndo] = useState<BoardEdit[]>([]),
    [redo, setRedo] = useState<BoardEdit[]>([]);
  const [pending, setPending] = useState<Pending[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(scope) ?? "[]").map((
        p: Pending,
      ) => ({ ...p, data: boardDataSchema.parse(p.data) }));
    } catch {
      return [];
    }
  });
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const inFlight = useRef(new Set<string>()),
    root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState<[number, number][]>([]),
    stroke = useRef<[number, number][]>([]);
  const [comments, setComments] = useState<Comment[]>([]),
    [comment, setComment] = useState(""),
    [replyTo, setReplyTo] = useState<string | null>(null);

  const [lineColor, setLineColor] = useState<BoardData["color"]>("ink"),
    [thickness, setThickness] = useState(3);
  const commitPending = useCallback((next: Pending[]) => {
    pendingRef.current = next;
    setPending(next);
    try {
      if (next.length) localStorage.setItem(scope, JSON.stringify(next));
      else localStorage.removeItem(scope);
    } catch {
      setError(
        "This browser cannot retain drafts locally. Keep this page open until saving succeeds.",
      );
    }
  }, [scope]);
  useEffect(() => {
    if (!editor) return;
    const current = latest.current.find((row) => row.id === editor.id);
    if (
      current && JSON.stringify(current.data) !== JSON.stringify(editor.data)
    ) {
      commitPending([...pendingRef.current.filter((p) => p.id !== editor.id), {
        id: editor.id,
        data: editor.data,
        expected: editor.expected,
        deleted: false,
      }]);
    }
  }, [editor, commitPending]);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void boardService.load(projectId).then((next) => {
        if (!alive) return;
        setRows((old) => mergeBoardRows(old, next));
        setReady(true);
        setStatus(mode === "demo" ? "Saved in this browser" : "Synced");
        setError("");
      }).catch((e) => {
        if (alive) {
          setError(e.message);
          setStatus("Offline · drafts retained");
        }
      });
    refresh();
    // Poll repairs missed events/reconnects; object versions prevent stale rollback.
    const timer = setInterval(refresh, 15000);
    const channel = mode === "integrated"
      ? supabase!.channel(`project-board:${projectId}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "board_objects",
          filter: `project_id=eq.${projectId}`,
        }, (event) => {
          const row = event.new as BoardObject;
          if (row.id && row.project_id === projectId) {
            const parsed = boardDataSchema.safeParse(row.data);
            if (parsed.success) {
              setRows((old) =>
                mergeBoardRows(old, [{ ...row, data: parsed.data }])
              );
            }
          }
        }).subscribe((state) => {
          if (alive) {
            setStatus(
              state === "SUBSCRIBED" ? "Live · synced" : "Reconnecting…",
            );
            if (state === "SUBSCRIBED") refresh();
          }
        })
      : undefined;
    const unload = (event: BeforeUnloadEvent) => {
      if (pendingRef.current.length || inFlight.current.size) {
        event.preventDefault();
      }
    };
    window.addEventListener("online", refresh);
    window.addEventListener("beforeunload", unload);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("beforeunload", unload);
      if (channel) void supabase!.removeChannel(channel);
    };
  }, [projectId]);

  async function save(
    id: string,
    data: BoardData,
    expected: number,
    deleted = false,
    record = true,
  ) {
    if (inFlight.current.has(id)) {
      setError("This object is still saving. Wait before editing it again.");
      return null;
    }
    const before = latest.current.find((row) => row.id === id),
      draft = { id, data, expected, deleted };
    commitPending([...pendingRef.current.filter((p) => p.id !== id), draft]);
    inFlight.current.add(id);
    setStatus("Saving…");
    try {
      const row = await boardService.save(
        projectId,
        id,
        data,
        expected,
        deleted,
      );
      setRows((old) => mergeBoardRows(old, [row]));
      // Update the synchronous source before another click can start a write.
      latest.current = mergeBoardRows(latest.current, [row]);
      commitPending(pendingRef.current.filter((p) => p.id !== id));
      if (record) {
        setUndo(
          (old) => [...old.slice(-49), {
            id,
            before: before && !before.deleted ? before.data : null,
            after: deleted ? null : data,
            version: row.version,
          }],
        );
        setRedo([]);
      }
      setStatus(mode === "demo" ? "Saved in this browser" : "Saved");
      setError("");
      return row;
    } catch (e) {
      setError((e as Error).message);
      setStatus("Unsaved draft retained");
      return null;
    } finally {
      inFlight.current.delete(id);
    }
  }
  const edit = (id: string) => {
    const row = latest.current.find((row) => row.id === id);
    if (row) {
      setEditor({ id, data: structuredClone(row.data), expected: row.version });
      setComment("");
      setReplyTo(null);
    }
  };
  const resize = (
    id: string,
    width: number,
    height: number,
    x: number,
    y: number,
  ) => {
    const row = geometryBases.current.get(id);
    if (row) {
      const write = boardGeometryWrite(row, { width, height, x, y });
      void save(write.id, write.data, write.expected).finally(
        () => {
          geometryBases.current.delete(id);
          setMoving(null);
        },
      );
    }
  };
  const nodes = useMemo<BoardNode[]>(
    () =>
      rows.filter((row) => !row.deleted && row.data.kind !== "connector").map(
        (row) => ({
          id: row.id,
          type: "board",
          position: { x: row.data.x, y: row.data.y },
          width: row.data.width,
          height: row.data.height,
          style: { width: row.data.width, height: row.data.height },
          zIndex: row.data.z,
          selected: selected.includes(row.id),
          data: {
            row,
            onEdit: edit,
            onResize: resize,
            onGeometryStart: (row) => geometryBases.current.set(row.id, row),
            file: s.files?.find((file) =>
              file.id === row.data.fileId && file.projectId === projectId
            ),
          },
        }),
      ),
    [rows, selected, s.files],
  );
  const [moving, setMoving] = useState<BoardNode[] | null>(null);
  const geometryBases = useRef(new Map<string, BoardObject>());
  const edges = rows.filter((row) =>
    !row.deleted && row.data.kind === "connector" && nodes.some((n) =>
      n.id === row.data.source
    ) && nodes.some((n) => n.id === row.data.target)
  ).map((row) => ({
    id: row.id,
    source: row.data.source!,
    target: row.data.target!,
    label: row.data.text,
    selected: selected.includes(row.id),
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: "var(--secondary)", strokeWidth: 1.5 },
  }));
  async function add(kind: BoardData["kind"], value?: BoardData) {
    const box = root.current!.getBoundingClientRect(),
      center = flow.screenToFlowPosition({
        x: box.left + box.width * .45,
        y: box.top + box.height * .4,
      });
    const id = crypto.randomUUID(),
      data = value ??
        newBoardData(
          kind,
          center.x + rows.length % 5 * 28,
          center.y + rows.length % 5 * 28,
        );
    const row = await save(id, data, 0);
    if (row) {
      setSelected([id]);
      if (!["stroke", "connector", "file"].includes(kind)) edit(id);
    }
    if (kind !== "stroke") setTool("select");
  }
  async function connect(c: Connection) {
    if (!c.source || !c.target || c.source === c.target) return;
    if (
      edges.some((edge) => edge.source === c.source && edge.target === c.target)
    ) return;
    await add("connector", {
      ...newBoardData("connector"),
      source: c.source,
      target: c.target,
    });
  }
  async function removeSelected() {
    for (const id of selected) {
      const row = latest.current.find((r) => r.id === id);
      if (row && !row.deleted) await save(id, row.data, row.version, true);
    }
    setSelected([]);
    setEditor(null);
  }
  async function duplicate() {
    const source = latest.current.filter((row) =>
      selected.includes(row.id) && !row.deleted && row.data.kind !== "connector"
    ).map((row) => row.data);
    for (const data of source) {
      await add(data.kind, {
        ...structuredClone(data),
        x: data.x + 35,
        y: data.y + 35,
      });
    }
  }
  async function history(back: boolean) {
    const stack = back ? undo : redo, entry = stack.at(-1);
    if (!entry) return;
    const row = latest.current.find((row) => row.id === entry.id);
    if (!row || row.version !== entry.version) {
      setError(
        "A collaborator changed this object. History will not overwrite their work.",
      );
      return;
    }
    const target = historyTarget(entry, back),
      saved = await save(
        entry.id,
        target ?? row.data,
        row.version,
        target === null,
        false,
      );
    if (saved) {
      const moved = { ...entry, version: saved.version };
      const remaining = stack.slice(0, -1);
      let previous = -1;
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (remaining[i].id === entry.id) {
          previous = i;
          break;
        }
      }
      if (previous >= 0) {
        remaining[previous] = {
          ...remaining[previous],
          version: saved.version,
        };
      }
      if (back) {
        setUndo(remaining);
        setRedo((old) => [...old, moved]);
      } else {
        setRedo(remaining);
        setUndo((old) => [...old, moved]);
      }
      setEditor(null);
    }
  }
  async function upload(chosen: File[]) {
    for (const file of chosen) {
      try {
        const uploaded = await files.upload(
          file,
          { projectId, x: 0, y: 0 },
          () => {},
        );
        await cache.invalidateQueries({ queryKey: ["workspace"] });
        await add("file", {
          ...newBoardData("file"),
          fileId: uploaded.id,
          text: uploaded.name,
          width: 280,
          height: 300,
        });
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }
  useEffect(() => {
    if (!editor || mode === "demo") {
      setComments([]);
      return;
    }
    let alive = true;
    const load = () =>
      void supabase!.from("board_comments").select("*").eq(
        "object_id",
        editor.id,
      ).order("created_at").then(({ data, error }) => {
        if (alive && !error) setComments(data ?? []);
      });
    load();
    const ch = supabase!.channel(`board-comments:${editor.id}`).on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "board_comments",
        filter: `object_id=eq.${editor.id}`,
      },
      load,
    ).subscribe();
    const timer = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
      void supabase!.removeChannel(ch);
    };
  }, [editor?.id]);
  async function postComment() {
    if (!editor || !comment.trim()) return;
    const actor = s.people.find((p) => p.id === s.actorId)!;
    const { data, error } = await supabase!.from("board_comments").insert({
      object_id: editor.id,
      body: comment.trim(),
      author_name: actor.name,
      reply_to: replyTo,
    }).select().single();
    if (error) {
      setError("Could not post feedback. Your text is retained.");
      return;
    }
    setComments((old) => [...old.filter((c) => c.id !== data.id), data]);
    setComment("");
    setReplyTo(null);
  }
  return (
    <div
      className={`project-board tool-${tool}`}
      ref={root}
      tabIndex={0}
      aria-label="Project collaboration whiteboard"
      onKeyUp={(e) => {
        if (
          !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            e.key,
          ) || !moving ||
          (e.target as HTMLElement).closest(
            "input,textarea,select,[contenteditable=true]",
          )
        ) return;
        const changed = moving.filter((node) => {
          const row = node.data.row;
          return selected.includes(node.id) &&
            (row.data.x !== node.position.x || row.data.y !== node.position.y);
        });
        void Promise.all(changed.map((node) => {
          const write = boardGeometryWrite(node.data.row, node.position);
          return save(write.id, write.data, write.expected);
        })).finally(() => setMoving(null));
      }}
      onCopy={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,[contenteditable=true]",
          )
        ) return;
        const objects = latest.current.filter((row) =>
          selected.includes(row.id) && !row.deleted &&
          row.data.kind !== "connector"
        ).map((row) => row.data);
        if (objects.length) {
          e.preventDefault();
          e.clipboardData.setData(
            "application/x-crewcanvas-objects",
            JSON.stringify(objects),
          );
          e.clipboardData.setData(
            "text/plain",
            objects.map((data) => data.text).join("\n"),
          );
        }
      }}
      onPaste={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,[contenteditable=true]",
          )
        ) return;
        const raw = e.clipboardData.getData("application/x-crewcanvas-objects");
        if (raw) {
          e.preventDefault();
          try {
            const objects = JSON.parse(raw);
            if (!Array.isArray(objects) || objects.length > 100) {
              throw new Error();
            }
            for (const item of objects) {
              const data = boardDataSchema.parse(item);
              if (data.kind !== "connector") {
                void add(data.kind, {
                  ...data,
                  x: data.x + 35,
                  y: data.y + 35,
                });
              }
            }
          } catch {
            setError(
              "This clipboard does not contain valid CrewCanvas objects.",
            );
          }
          return;
        }
        const url = e.clipboardData.getData("text/plain").trim();
        if (/^https:\/\/\S+$/i.test(url) && url.length <= 2000) {
          e.preventDefault();
          try {
            const parsed = new URL(url);
            void add("link", {
              ...newBoardData("link"),
              url: parsed.href,
              text: parsed.hostname,
            });
          } catch {
            setError("Paste a valid HTTPS reference link.");
          }
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void upload(Array.from(e.dataTransfer.files));
      }}
      onKeyDown={(e) => {
        if (
          (e.target as HTMLElement).closest(
            "input,textarea,select,[contenteditable=true]",
          )
        ) return;
        if (
          (e.ctrlKey || e.metaKey) &&
          ["z", "y", "d"].includes(e.key.toLowerCase())
        ) {
          e.preventDefault();
          const key = e.key.toLowerCase();
          if (key === "z" || key === "y") {
            void history(
              key === "z" && !e.shiftKey,
            );
          }
          if (key === "d") void duplicate();
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          void removeSelected();
        }
      }}
    >
      <div className="board-context">
        <div>
          <small>PROJECT WHITEBOARD</small>
          <strong>{project.title}</strong>
          <span>
            {project.state.replaceAll("_", " ")} ·{" "}
            {agreement?.deadline ?? "Deadline awaiting agreement"}
          </span>
        </div>
        <button className="button secondary" onClick={openProject}>
          Agreement & deliverables <ArrowRight size={14} />
        </button>
      </div>
      <ReactFlow<BoardNode>
        nodes={moving ?? nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => {
          if (
            changes.some((change) =>
              change.type === "position" ||
              change.type === "dimensions" && change.resizing
            )
          ) setMoving((old) => applyNodeChanges(changes, old ?? nodes));
          for (const change of changes) {
            if (change.type === "select") {
              setSelected((old) =>
                change.selected
                  ? [...new Set([...old, change.id])]
                  : old.filter((id) => id !== change.id)
              );
            }
          }
        }}
        onNodeDragStart={(_, __, dragged) => {
          for (const node of dragged) {
            geometryBases.current.set(
              node.id,
              node.data.row,
            );
          }
        }}
        onNodeDragStop={async (_, __, dragged) => {
          const writes = dragged.map((node) => {
            const row = geometryBases.current.get(node.id) ?? node.data.row;
            const write = boardGeometryWrite(row, node.position);
            return save(write.id, write.data, write.expected);
          });
          await Promise.all(writes);
          for (const node of dragged) geometryBases.current.delete(node.id);
          setMoving(null);
        }}
        onNodeClick={(event, node) => {
          if (
            tool === "select" && !event.shiftKey && !event.metaKey &&
            !event.ctrlKey
          ) edit(node.id);
          if (tool === "eraser") {
            const row = latest.current.find((r) => r.id === node.id);
            if (row?.data.kind === "stroke") {
              void save(
                row.id,
                row.data,
                row.version,
                true,
              );
            }
          }
        }}
        onNodeDoubleClick={(_, node) => edit(node.id)}
        onEdgeClick={(_, edge) => setSelected([edge.id])}
        onEdgeDoubleClick={(_, edge) => edit(edge.id)}
        onPaneClick={() => {
          setEditor(null);
          setSelected([]);
        }}
        onConnect={(c) => void connect(c)}
        panOnDrag={tool === "hand" ? true : [1, 2]}
        selectionOnDrag={tool === "select"}
        nodesDraggable={tool === "select"}
        nodesConnectable={tool === "select"}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        minZoom={.1}
        maxZoom={3}
        onlyRenderVisibleElements
        fitView
        fitViewOptions={{ padding: .3, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--board-dot)" gap={24} />
      </ReactFlow>
      {tool === "pen" && (
        <svg
          className="drawing-layer"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            const box = root.current!.getBoundingClientRect();
            stroke.current = [[e.clientX - box.left, e.clientY - box.top]];
            setDrawing(stroke.current);
          }}
          onPointerMove={(e) => {
            if (
              !stroke.current.length || stroke.current.length >= 1000
            ) return;
            const box = root.current!.getBoundingClientRect(),
              point: [number, number] = [
                e.clientX - box.left,
                e.clientY - box.top,
              ],
              last = stroke.current.at(-1)!;
            if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 3) return;
            stroke.current = [...stroke.current, point];
            setDrawing(stroke.current);
          }}
          onPointerUp={() => {
            const box = root.current!.getBoundingClientRect(),
              points = stroke.current.map((p) =>
                flow.screenToFlowPosition({
                  x: p[0] + box.left,
                  y: p[1] + box.top,
                })
              );
            stroke.current = [];
            setDrawing([]);
            if (points.length < 2) return;
            const x = Math.min(...points.map((p) => p.x)) - 4,
              y = Math.min(...points.map((p) => p.y)) - 4,
              width = Math.max(20, Math.max(...points.map((p) => p.x)) - x + 4),
              height = Math.max(
                20,
                Math.max(...points.map((p) => p.y)) - y + 4,
              );
            if (width > 3000 || height > 3000) {
              setError("Draw a smaller stroke, or zoom in first.");
              return;
            }
            void add("stroke", {
              ...newBoardData("stroke", x, y),
              width,
              height,
              color: lineColor,
              thickness,
              points: points.map((p) => [p.x - x, p.y - y]),
            });
          }}
          onPointerCancel={() => {
            stroke.current = [];
            setDrawing([]);
          }}
        >
          <polyline
            points={drawing.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="var(--text)"
            strokeWidth={thickness * viewport.zoom}
            strokeLinecap="round"
          />
        </svg>
      )}
      <div className="board-toolbar" aria-label="Whiteboard tools">
        {([
          { tool: "select", label: "Select", icon: MousePointer2 },
          { tool: "hand", label: "Pan", icon: Hand },
          { tool: "pen", label: "Draw", icon: Pencil },
          { tool: "eraser", label: "Erase strokes", icon: Trash2 },
        ] as const).map(({ tool: t, label, icon: Icon }) => (
          <button
            key={t}
            title={label}
            aria-label={label}
            aria-pressed={tool === t}
            onClick={() => {
              setTool(t);
              setEditor(null);
            }}
          >
            <Icon size={18} />
          </button>
        ))}
        <span className="tool-divider" />
        <button
          title="Sticky note"
          aria-label="Add sticky note"
          disabled={!ready}
          onClick={() => void add("note")}
        >
          <StickyNote size={18} />
        </button>
        <button
          title="Text"
          aria-label="Add text"
          disabled={!ready}
          onClick={() => void add("text")}
        >
          <Type size={18} />
        </button>
        <button
          title="Rectangle"
          aria-label="Add rectangle"
          disabled={!ready}
          onClick={() => void add("rectangle")}
        >
          <Square size={18} />
        </button>
        <button
          title="Circle"
          aria-label="Add circle"
          disabled={!ready}
          onClick={() => void add("circle")}
        >
          <Circle size={18} />
        </button>
        <button
          title="Frame"
          aria-label="Add frame"
          disabled={!ready}
          onClick={() => void add("frame")}
        >
          <Layers size={18} />
        </button>
        <button
          title="Reference link"
          aria-label="Add link"
          disabled={!ready}
          onClick={() => void add("link")}
        >
          <Link2 size={18} />
        </button>
        <button
          title="Upload project file"
          aria-label="Upload project file"
          disabled={!ready}
          onClick={() => input.current?.click()}
        >
          <FileUp size={18} />
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {tool === "pen" && (
        <div className="pen-options">
          <label>
            Ink<select
              value={lineColor}
              onChange={(e) =>
                setLineColor(e.target.value as BoardData["color"])}
            >
              {boardColors.map((color) => <option key={color}>{color}</option>)}
            </select>
          </label>
          <label>
            Width<input
              type="range"
              min={1}
              max={16}
              value={thickness}
              onChange={(e) => setThickness(Number(e.target.value))}
            />
          </label>
        </div>
      )}
      {!rows.some((row) => !row.deleted) && ready && (
        <div className="board-empty">
          <StickyNote size={26} />
          <h3>Room to work through ideas.</h3>
          <p>
            Plan this project together. Agreements, deliverables and payments
            stay connected above.
          </p>
          <button className="button secondary" onClick={() => void add("note")}>
            Add a project note
          </button>
        </div>
      )}
      <div className="board-bottom">
        <span role="status">
          {pending.length ? `${pending.length} unsaved draft(s)` : status}
        </span>
        <div>
          <button
            aria-label="Undo whiteboard edit"
            disabled={!undo.length}
            onClick={() => void history(true)}
          >
            <Undo2 size={17} />
          </button>
          <button
            aria-label="Redo whiteboard edit"
            disabled={!redo.length}
            onClick={() => void history(false)}
          >
            <Redo2 size={17} />
          </button>
          <button aria-label="Zoom out" onClick={() => void flow.zoomOut()}>
            <ZoomOut size={17} />
          </button>
          <span>{Math.round(viewport.zoom * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => void flow.zoomIn()}>
            <ZoomIn size={17} />
          </button>
          <button
            aria-label="Fit board"
            onClick={() => void flow.fitView({ padding: .3, maxZoom: 1 })}
          >
            <Scan size={17} />
          </button>
        </div>
      </div>
      {error && (
        <div className="board-error" role="alert">
          {error}
          <button
            onClick={() => setError("")}
            aria-label="Dismiss board message"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {pending.length > 0 && !inFlight.current.size && (
        <div className="board-recovery">
          <strong>Unsaved work retained on this device</strong>
          {pending.map((p) => (
            <div key={p.id}>
              <span>
                {p.data.kind}: {p.data.text.slice(0, 35) || "drawing"}
              </span>
              <button
                onClick={() => void save(p.id, p.data, p.expected, p.deleted)}
              >
                Retry original version
              </button>
              <button
                onClick={() => {
                  edit(p.id);
                  notify(
                    "Review the current object before copying your retained draft into it.",
                  );
                }}
              >
                Review current
              </button>
              <button
                onClick={() =>
                  commitPending(
                    pendingRef.current.filter((d) => d.id !== p.id),
                  )}
              >
                Discard draft
              </button>
            </div>
          ))}
        </div>
      )}
      {editor && (
        <aside
          className="board-inspector"
          aria-label="Whiteboard object inspector"
        >
          <div className="board-inspector-title">
            <strong>
              {editor.data.kind === "note" ? "Project note" : editor.data.kind}
            </strong>
            <button
              aria-label="Close object inspector"
              onClick={() => setEditor(null)}
            >
              <X size={18} />
            </button>
          </div>
          {latest.current.find((row) => row.id === editor.id)?.version !==
              editor.expected && (
            <p className="board-warning">
              This object changed. Your draft is preserved. Close and reopen to
              review the current version.
            </p>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const saved = await save(editor.id, editor.data, editor.expected);
              if (saved) {
                setEditor({
                  id: saved.id,
                  data: saved.data,
                  expected: saved.version,
                });
              }
            }}
          >
            <label>
              Content<textarea
                value={editor.data.text}
                maxLength={6000}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    data: { ...editor.data, text: e.target.value },
                  })}
              />
            </label>
            <label>
              Color<select
                value={editor.data.color}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    data: {
                      ...editor.data,
                      color: e.target.value as BoardData["color"],
                    },
                  })}
              >
                {boardColors.map((color) => (
                  <option key={color}>{color}</option>
                ))}
              </select>
            </label>
            {["rectangle", "circle", "diamond", "line", "arrow"].includes(
              editor.data.kind,
            ) && (
              <label>
                Shape<select
                  value={editor.data.kind}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      data: {
                        ...editor.data,
                        kind: e.target.value as BoardData["kind"],
                      },
                    })}
                >
                  {["rectangle", "circle", "diamond", "line", "arrow"].map(
                    (kind) => <option key={kind}>{kind}</option>,
                  )}
                </select>
              </label>
            )}
            {editor.data.kind === "link" && (
              <label>
                HTTPS reference<input
                  type="url"
                  pattern="https://.*"
                  maxLength={2000}
                  value={editor.data.url}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      data: { ...editor.data, url: e.target.value },
                    })}
                />
              </label>
            )}
            <div className="board-field-row">
              <label>
                Size<input
                  type="number"
                  min={12}
                  max={72}
                  value={editor.data.fontSize}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      data: {
                        ...editor.data,
                        fontSize: Math.max(
                          12,
                          Math.min(
                            72,
                            Math.round(Number(e.target.value) || 16),
                          ),
                        ),
                      },
                    })}
                />
              </label>
              <label>
                Align<select
                  value={editor.data.align}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      data: {
                        ...editor.data,
                        align: e.target.value as BoardData["align"],
                      },
                    })}
                >
                  {["left", "center", "right"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="board-checkbox">
              <input
                type="checkbox"
                checked={editor.data.bold}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    data: { ...editor.data, bold: e.target.checked },
                  })}
              />{" "}
              Bold text
            </label>
            <div className="board-field-row">
              <label>
                Layer<input
                  type="number"
                  min={-1000}
                  max={1000}
                  value={editor.data.z}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      data: {
                        ...editor.data,
                        z: Math.max(
                          -1000,
                          Math.min(
                            1000,
                            Math.round(Number(e.target.value) || 0),
                          ),
                        ),
                      },
                    })}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setSelected([editor.id]);
                  void duplicate();
                }}
              >
                <Copy size={15} /> Duplicate
              </button>
            </div>
            <button
              className="button primary"
              type="submit"
              disabled={latest.current.find((row) => row.id === editor.id)
                ?.version !== editor.expected}
            >
              Save object
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={latest.current.find((row) => row.id === editor.id)
                ?.version !== editor.expected}
              onClick={() => {
                const row = latest.current.find((row) => row.id === editor.id)!;
                void save(row.id, row.data, row.version, true).then((saved) => {
                  if (saved) setEditor(null);
                });
              }}
            >
              <Trash2 size={14} /> Delete object
            </button>
          </form>
          <section className="board-comments">
            <h3>
              <MessageSquare size={15} /> Project feedback
            </h3>
            <p>
              Discussion only. Paid revisions still require the agreement
              workflow.
            </p>
            {mode === "demo"
              ? <p>Shared feedback is available in integrated workspaces.</p>
              : (
                <>
                  {comments.map((c) => (
                    <article
                      key={c.id}
                      className={c.resolved ? "resolved" : ""}
                    >
                      <strong>{c.author_name}</strong>
                      <time>{new Date(c.created_at).toLocaleString()}</time>
                      {c.reply_to && (
                        <small>
                          Reply to{" "}
                          {comments.find((parent) => parent.id === c.reply_to)
                            ?.author_name ?? "discussion"}
                        </small>
                      )}
                      <p>{c.body}</p>
                      <div>
                        <button onClick={() => setReplyTo(c.id)}>Reply</button>
                        <button
                          onClick={async () => {
                            const { error } = await supabase!.from(
                              "board_comments",
                            ).update({ resolved: !c.resolved }).eq("id", c.id);
                            if (!error) {
                              setComments((old) =>
                                old.map((row) =>
                                  row.id === c.id
                                    ? { ...row, resolved: !row.resolved }
                                    : row
                                )
                              );
                            }
                          }}
                        >
                          {c.resolved ? "Reopen" : "Resolve"}
                        </button>
                      </div>
                    </article>
                  ))}
                  {replyTo && (
                    <button onClick={() => setReplyTo(null)}>
                      Cancel reply
                    </button>
                  )}
                  <textarea
                    aria-label="Feedback comment"
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Leave feedback on this object…"
                  />
                  <button
                    className="button secondary"
                    disabled={!comment.trim()}
                    onClick={() => void postComment()}
                  >
                    Post feedback
                  </button>
                </>
              )}
          </section>
        </aside>
      )}
    </div>
  );
}

export default function ProjectBoard(
  { snapshot, onOpen, notify }: {
    snapshot: WorkspaceSnapshot;
    onOpen: (workerId: string, filter?: "all", projectId?: string) => void;
    notify: (text: string) => void;
  },
) {
  const [projectId, setProjectId] = useState(snapshot.projects[0]?.id ?? "");
  const project = snapshot.projects.find((p) => p.id === projectId) ??
    snapshot.projects[0];
  return (
    <div className="project-board-shell">
      <div className="project-board-switch">
        <label>
          Collaborate on<select
            aria-label="Whiteboard project"
            value={project?.id ?? ""}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {snapshot.projects.map((p) => (
              <option value={p.id} key={p.id}>{p.title}</option>
            ))}
          </select>
        </label>
        <span>Private to this project's client and assigned freelancer</span>
      </div>
      {project
        ? (
          <FocusCanvas>
            <ReactFlowProvider>
              <Board
                key={`${snapshot.actorId}:${project.id}`}
                snapshot={snapshot}
                projectId={project.id}
                openProject={() => onOpen(project.workerId, "all", project.id)}
                notify={notify}
              />
            </ReactFlowProvider>
          </FocusCanvas>
        )
        : (
          <div className="empty-state">
            <h3>A project comes first.</h3>
            <p>
              Create a project and agree the work with a freelancer, then plan
              it together here.
            </p>
          </div>
        )}
    </div>
  );
}
