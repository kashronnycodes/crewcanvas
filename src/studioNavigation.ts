import { useEffect, useRef, useState } from "react";
import type { ProjectTab } from "../shared/freelance-canvas";
export interface StudioRoute {
  projectId?: string;
  role?: string;
  memberId?: string;
  taskId?: string;
  form?: boolean;
  tools?: boolean;
  tab?: ProjectTab;
}
export function parentRoute(route: StudioRoute): StudioRoute {
  if (route.form) return route.memberId ? { ...route, form: undefined } : {};
  if (route.tools || route.taskId) return {};
  if (route.memberId) return { projectId: route.projectId, role: route.role };
  if (route.role) return { projectId: route.projectId };
  return {};
}
const routeKey = (route: StudioRoute) => JSON.stringify(route);
export function useStudioNavigation(workspaceId: string) {
  const [route, setRoute] = useState<StudioRoute>({});
  const positions = useRef(new Map<string, number>());
  const current = useRef(route);
  current.current = route;
  const depth = useRef(0);
  function remember() {
    positions.current.set(
      routeKey(current.current),
      document.querySelector(".modal-content, .drawer-body, .workflow-panel")
        ?.scrollTop ?? 0,
    );
  }
  useEffect(() => {
    history.replaceState({
      ...history.state,
      crewStudio: { workspaceId, route: {}, depth: 0 },
    }, "");
    const pop = (event: PopStateEvent) => {
      const state = event.state?.crewStudio;
      if (state?.workspaceId === workspaceId) {
        remember();
        depth.current = state.depth;
        setRoute(state.route);
      } else {
        depth.current = 0;
        setRoute({});
      }
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [workspaceId]);
  useEffect(() => {
    const panel = document.querySelector(
      ".modal-content, .drawer-body, .workflow-panel",
    );
    if (panel) panel.scrollTop = positions.current.get(routeKey(route)) ?? 0;
  }, [route]);
  function open(next: StudioRoute) {
    if (routeKey(next) === routeKey(current.current)) return;
    remember();
    depth.current++;
    history.pushState({
      ...history.state,
      crewStudio: {workspaceId,route:next,depth:depth.current},
    }, "");
    setRoute(next);
  }
  function back() {
    if (depth.current > 0) history.back();
    else {
      remember();
      const parent = parentRoute(current.current);
      history.replaceState({
        ...history.state,
        crewStudio: { workspaceId, route: parent, depth: 0 },
      }, "");
      setRoute(parent);
    }
  }
  function close() {
    remember();
    if (depth.current > 0) history.go(-depth.current);
    else setRoute({});
  }
  return { route, open, back, close };
}
