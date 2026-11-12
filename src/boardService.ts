import {
type BoardData,
boardDataSchema,
type BoardObject,
} from "../shared/board";
import { supabase } from "./services";
export const boardService = {
  async load(projectId: string): Promise<BoardObject[]> {
    if (!supabase) throw new Error("Cannot open the board. Connect CrewCanvas to Supabase and try again.");
    const { data, error } = await supabase!.from("board_objects").select("*")
      .eq("project_id", projectId).order("updated_at");
    if (error) {
      throw new Error(
        "Whiteboard unavailable. Your project workflow is still available.",
      );
    }
    return (data ?? []).map((row) => ({
      ...row,
      data: boardDataSchema.parse(row.data),
    }));
  },
  async save(
    projectId: string,
    id: string,
    value: BoardData,
    expected: number,
    deleted = false,
  ): Promise<BoardObject> {
    // A removed underlying file must not prevent removing its visual card.
    // Undo still validates the original file reference before restoring it.
    const data = boardDataSchema.parse(
      deleted ? { ...value, fileId: null, fileVersion: null } : value,
    );
    if (!supabase) throw new Error("Cannot save the board. Connect CrewCanvas to Supabase and try again.");
    const result = expected === 0
      ? await supabase!.from("board_objects").insert({
        id,
        project_id: projectId,
        data,
      }).select().single()
      : await supabase!.from("board_objects").update({
        data,
        version: expected + 1,
        deleted,
      }).eq("id", id).eq("project_id", projectId).eq("version", expected)
        .select().maybeSingle();
    if (result.error) {
      throw new Error(
        result.error.code === "23505"
          ? "This object already exists. Refresh the board."
          : "Could not save this object. Your draft is retained; check your connection or permissions.",
      );
    }
    if (!result.data) {
      throw new Error(
        "This object changed. Review the current version before retrying.",
      );
    }
    return result.data as BoardObject;
  },
};
