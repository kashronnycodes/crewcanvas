import { z } from "zod";

export const boardKinds = [
  "note",
  "text",
  "rectangle",
  "circle",
  "diamond",
  "line",
  "arrow",
  "stroke",
  "frame",
  "link",
  "file",
  "connector",
] as const;
export const boardColors = ["sand", "sage", "sky", "rose", "ink"] as const;
export const boardDataSchema = z.object({
  kind: z.enum(boardKinds),
  text: z.string().max(6000),
  color: z.enum(boardColors),
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
  width: z.number().min(20).max(3000),
  height: z.number().min(20).max(3000),
  z: z.number().int().min(-1000).max(1000),
  fontSize: z.number().int().min(12).max(72),
  bold: z.boolean(),
  align: z.enum(["left", "center", "right"]),
  thickness: z.number().min(1).max(16),
  points: z.array(
    z.tuple([z.number().min(0).max(3000), z.number().min(0).max(3000)]),
  ).max(1000),
  url: z.string().max(2000).refine(
    (value) => !value || /^https:\/\//i.test(value),
    "Use an HTTPS link",
  ),
  fileId: z.uuid().nullable(),
  source: z.uuid().nullable(),
  target: z.uuid().nullable(),
}).strict();
export type BoardData = z.infer<typeof boardDataSchema>;
export interface BoardObject {
  id: string;
  project_id: string;
  author_id: string;
  updated_by: string;
  version: number;
  deleted: boolean;
  data: BoardData;
  updated_at: string;
}
export function newBoardData(kind: BoardData["kind"], x = 0, y = 0): BoardData {
  return {
    kind,
    text: kind === "note"
      ? "A thought for this project"
      : kind === "frame"
      ? "Project inspiration"
      : "",
    color: "sand",
    x,
    y,
    width: kind === "frame" ? 650 : 240,
    height: kind === "frame" ? 440 : kind === "text" ? 100 : 180,
    z: kind === "frame" ? -100 : 0,
    fontSize: 16,
    bold: false,
    align: "left",
    thickness: 3,
    points: [],
    url: "",
    fileId: null,
    source: null,
    target: null,
  };
}
export interface BoardEdit {
  id: string;
  before: BoardData | null;
  after: BoardData | null;
  version: number;
}
// History contains only whiteboard data. It cannot contain a domain command.
export function historyTarget(edit: BoardEdit, undo: boolean) {
  return undo ? edit.before : edit.after;
}
export function mergeBoardRows(
  current: BoardObject[],
  incoming: BoardObject[],
): BoardObject[] {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    if (!rows.has(row.id) || rows.get(row.id)!.version < row.version) {
      rows.set(row.id, row);
    }
  }
  return [...rows.values()];
}
