import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useStudioNavigation } from "../src/studioNavigation";
afterEach(() => {
  cleanup();
  document.querySelector(".modal-content")?.remove();
});
it("restores member scroll on browser Back and avoids duplicate destinations", async () => {
  const panel = document.createElement("div");
  panel.className = "modal-content";
  document.body.append(panel);
  const { result } = renderHook(() => useStudioNavigation("navigation-test"));
  const member = { projectId: "project", role: "Editor", memberId: "member" };
  act(() => result.current.open(member));
  const length = history.length;
  act(() => result.current.open(member));
  expect(history.length).toBe(length);
  panel.scrollTop = 184;
  act(() => result.current.open({ ...member, taskId: "task" }));
  expect(panel.scrollTop).toBe(0);
  act(() => result.current.back());
  await waitFor(() => expect(result.current.route).toEqual(member));
  expect(panel.scrollTop).toBe(184);
  act(() => result.current.back());
  await waitFor(() =>
    expect(result.current.route).toEqual({
      projectId: "project",
      role: "Editor",
    })
  );
  act(() => result.current.back());
  await waitFor(() =>
    expect(result.current.route).toEqual({ projectId: "project" })
  );
});
