import type { SessionActor, WorkspaceSnapshot } from "./types.ts";
import { activeAgreement, todayIn } from "./domain.ts";
// Defense in depth: even an accidentally over-broad snapshot cannot leave this boundary.
export function workspaceAIContext(s: WorkspaceSnapshot, actor: SessionActor) {
  if (s.id !== actor.workspaceId || !s.people.some((p) => p.id === actor.id)) {
    throw new Error("Workspace access denied.");
  }
  const projects = s.projects.filter((p) =>
    p.workspaceId === actor.workspaceId &&
    (actor.role === "employer" || p.workerId === actor.id)
  ).slice(0, 60);
  const ids = new Set(projects.map((p) => p.id));
  const context = {
    truncated: s.projects.length > projects.length,
    workspace: s.name,
    today: todayIn(s.timezone),
    timezone: s.timezone,
    projects: projects.map((p) => {
      const a = activeAgreement(p);
      return {
        id: p.id,
        title: p.title,
        state: p.state,
        assignedTo: s.people.find((x) => x.id === p.workerId)?.name ??
          "Assigned freelancer",
        brief: a?.brief.slice(0, 2000) ?? "No accepted agreement",
        tasks: a?.tasks?.slice(0, 10).map((t) => t.slice(0, 300)),
        deliverables: a?.deliverables.slice(0, 10).map((t) => t.slice(0, 300)),
        deadline: a?.deadline,
        overdue: !!a && a.deadline < todayIn(s.timezone) &&
          p.state !== "accepted",
        deliveries: p.deliveries.slice(-8).map((d) => ({
          label: d.label,
          note: d.note.slice(0, 1000),
          status: d.status,
          submittedAt: d.submittedAt,
        })),
        revisions: p.revisions.slice(-3).map((r) => ({
          text: r.text.slice(0, 2000),
          createdAt: r.createdAt,
          items: r.items.slice(0, 5).map((i) => ({
            text: i.text.slice(0, 1000),
            disposition: i.disposition,
          })),
        })),
        activity: p.activity.slice(-12).map((e) => ({
          text: e.text.slice(0, 500),
          createdAt: e.createdAt,
        })),
      };
    }),
    activity: (s.workspaceActivity ?? []).filter((e) =>
      e.projectId ? ids.has(e.projectId) : actor.role === "employer"
    ).slice(0, 30).map((e) => ({
      text: e.text.slice(0, 500),
      createdAt: e.createdAt,
    })),
  };
  while (JSON.stringify(context).length > 60000 && context.projects.length) {
    context.projects.pop();
    context.truncated = true;
  }
  const included = new Set(context.projects.map((p) => p.id));
  // Project activity outside the bounded context must not imply it was summarized.
  context.activity = context.activity.slice(0, 20);
  if (included.size !== projects.length) context.truncated = true;
  return context;
}
