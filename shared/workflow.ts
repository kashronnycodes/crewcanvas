import type {
  Person,
  Project,
  WorkflowCollection,
  WorkspaceSnapshot,
} from "./types.ts";
import { visibleTerms } from "./freelance-canvas.ts";

// These roles describe work only. Access continues to come from server membership
// and each task's existing client/assigned-freelancer agreement.
export function workflowCollections(
  s: WorkspaceSnapshot,
): WorkflowCollection[] {
  const workers = s.people.filter((p) => p.accessRole === "worker");
  const names = [...new Set(workers.map((p) => p.role))];
  const saved = s.layout.workflow?.length ? s.layout.workflow : [{
    id: s.id,
    title: s.name,
    roles: names.map((name) => ({
      id: workers.find((p) => p.role === name)!.id,
      name,
      members: workers.filter((p) => p.role === name).map((p) => p.id),
    })),
  }];
  // Preserve assignments created by the earlier workflow branch without rewriting
  // their accepted terms, identities or per-assignee authorization boundary.
  const parents = [
    ...new Set(
      s.projects.filter((p) => !p.organization && p.parentProjectId).map((p) =>
        p.parentProjectId!
      ),
    ),
  ];
  return [
    ...saved,
    ...parents.filter((id) => !saved.some((c) => c.id === id)).map((id) => {
      const tasks = s.projects.filter((p) =>
        !p.organization && (p.id === id || p.parentProjectId === id)
      );
      const members = workers.filter((person) =>
        tasks.some((p) => p.workerId === person.id)
      );
      return {
        id,
        title: s.projects.find((p) => p.id === id)?.title ?? "Assigned project",
        roles: [...new Set(members.map((p) => p.role))].map((name) => ({
          id: members.find((p) => p.role === name)!.id,
          name,
          members: members.filter((p) => p.role === name).map((p) => p.id),
        })),
      };
    }),
  ];
}
export function collectionTasks(
  s: WorkspaceSnapshot,
  collectionId: string,
): Project[] {
  const fallback = workflowCollections(s)[0]?.id;
  const parents = new Set(
    s.projects.filter((p) => p.parentProjectId && !p.organization).map((p) =>
      p.parentProjectId
    ),
  );
  return s.projects.filter((p) =>
    p.organization
      ? p.organization.collectionId === collectionId
      : p.parentProjectId
      ? p.parentProjectId === collectionId
      : parents.has(p.id)
      ? p.id === collectionId
      : collectionId === fallback
  );
}
export interface HierarchyCard {
  id: string;
  kind: "project" | "roles" | "role" | "member" | "task";
  title: string;
  caption: string;
  x: number;
  y: number;
  person?: Person;
  task?: Project;
  onOpen: () => void;
}
export function visibleWorkflow(
  collections: WorkflowCollection[],
  tasks: Project[],
  memberId: string,
) {
  return collections.filter((c) =>
    c.roles.some((r) => r.members.includes(memberId)) ||
    tasks.some((t) => t.organization?.collectionId === c.id)
  )
    .map((c) => ({
      ...c,
      roles: c.roles.filter((r) =>
        r.members.includes(memberId) ||
        tasks.some((t) =>
          t.organization?.collectionId === c.id &&
          t.organization.roleId === r.id
        )
      )
        .map((r) => ({
          ...r,
          members: r.members.filter((id) => id === memberId),
        })),
    }));
}
export interface Hierarchy {
  cards: HierarchyCard[];
  edges: {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
  }[];
  height: number;
  layoutKey?: string;
}
export function workflowGraph(
  s: WorkspaceSnapshot,
  collection: WorkflowCollection,
  open: (kind: HierarchyCard["kind"], id: string) => void,
  options: { detailed?: boolean } = {},
): Hierarchy {
  if (options.detailed) return detailedWorkflowGraph(s, collection, open);
  const rootId = `project:${collection.id}`, hubId = `roles:${collection.id}`;
  const cards: HierarchyCard[] = [{
    id: rootId,
    kind: "project",
    title: collection.title,
    caption: "PROJECT / YOUR COLLABORATION SPACE",
    x: 80,
    y: 40,
    onOpen: () => open("project", collection.id),
  }, {
    id: hubId,
    kind: "roles",
    title: "Project roles",
    caption: `${collection.roles.length} roles · Choose who does what`,
    x: 80,
    y: 240,
    onOpen: () => open("roles", collection.id),
  }];
  const edges: Hierarchy["edges"] = [{
    id: `hierarchy:${rootId}:${hubId}`,
    source: rootId,
    target: hubId,
    sourceHandle: "bottom",
    targetHandle: "top",
  }];
  collection.roles.forEach((role, i) => {
    const id = `role:${role.id}`;
    cards.push({
      id,
      kind: "role",
      title: role.name,
      caption: `${role.members.length} member${
        role.members.length === 1 ? "" : "s"
      } · View roster`,
      x: 400 + i * 320,
      y: 240,
      onOpen: () => open("role", role.id),
    });
    edges.push({
      id: `hierarchy:${hubId}:${id}`,
      source: hubId,
      target: id,
      sourceHandle: "top",
      targetHandle: "top",
    });
  });
  return {
    cards,
    edges,
    height: 440,
    layoutKey: `${collection.id}:overview:${
      collection.roles.map((r) => r.id).join(":")
    }`,
  };
}
function detailedWorkflowGraph(
  s: WorkspaceSnapshot,
  collection: WorkflowCollection,
  open: (kind: HierarchyCard["kind"], id: string) => void,
): Hierarchy {
  const cards: HierarchyCard[] = [], edges: Hierarchy["edges"] = [];
  const add = (c: Omit<HierarchyCard, "onOpen">, parent?: string) => {
    cards.push({
      ...c,
      onOpen: () => open(c.kind, c.id.replace(/^[^:]+:/, "")),
    });
    if (parent) {
      edges.push({
        id: `hierarchy:${parent}:${c.id}`,
        source: parent,
        target: c.id,
      });
    }
  };
  add({
    id: `project:${collection.id}`,
    kind: "project",
    title: collection.title,
    caption: "PROJECT / PEOPLE & WORK",
    x: 80,
    y: 80,
  });
  let y = 80;
  for (const role of collection.roles) {
    const rid = `role:${role.id}`;
    add({
      id: rid,
      kind: "role",
      title: role.name,
      caption: `${role.members.length} member${
        role.members.length === 1 ? "" : "s"
      } · Open roster`,
      x: 400,
      y,
    }, `project:${collection.id}`);
    let memberY = y;
    for (const id of role.members) {
      const person = s.people.find((p) => p.id === id);
      if (!person) continue;
      const mid = `member:${role.id}:${id}`;
      // Role-qualified node IDs allow the same person in more than one role.
      const tasks = collectionTasks(s, collection.id).filter((p) =>
        p.workerId === id &&
        (p.organization
          ? p.organization.roleId === role.id
          : person.role === role.name)
      );
      add({
        id: mid,
        kind: "member",
        title: person.name,
        caption: `${tasks.length} assigned task${
          tasks.length === 1 ? "" : "s"
        }`,
        person,
        x: 720,
        y: memberY,
      }, rid);
      tasks.forEach((task, i) =>
        add({
          id: `task:${task.id}`,
          kind: "task",
          title: task.title,
          caption: `${task.state.replaceAll("_", " ")} · ${
            visibleTerms(task)?.deadline ?? "No date"
          }${task.deliveries.length ? " · 📎" : ""}`,
          task,
          person,
          x: 1040,
          y: memberY + i * 170,
        }, mid)
      );
      memberY += Math.max(170, tasks.length * 170);
    }
    y = Math.max(y + 170, memberY) + 40;
  }
  return {
    cards,
    edges,
    height: y + 80,
    layoutKey: `${collection.id}:details:${
      collection.roles.map((r) => r.id).join(":")
    }`,
  };
}
export function draftTaskCopy(p: Project) {
  const a = visibleTerms(p);
  return {
    title: `${p.title} (copy)`.slice(0, 120),
    brief: a?.brief ?? "",
    deliverables: a?.deliverables ?? [],
    tasks: a?.tasks ?? [],
    amountMinor: a?.amountMinor ?? "0",
    deadline: a?.deadline ?? "",
    revisionRounds: a?.revisionRounds ?? 2,
    paymentDays: a?.paymentDays ?? 7,
  };
}
