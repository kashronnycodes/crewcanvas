import { IDS, seedWorkspace } from "../shared/seed";
import type { WorkspaceSnapshot } from "../shared/types";

const winnersId = "30000000-0000-4000-8000-000000000003";
const psychologistId = "30000000-0000-4000-8000-000000000004";
const winners = [
  { id: IDS.ava, name: "jacob jaun da goat", initials: "JJ" },
  { id: IDS.leo, name: "vincent damaso da best", initials: "VD" },
  { id: IDS.mia, name: "jeshua rutaquio the king of ftf mapua", initials: "JR" },
  { id: IDS.nina, name: "myron manago da one", initials: "MM" },
];

// Apply this roster once to existing local demos without resetting business history.
export function migrateDemoRoster(snapshot: WorkspaceSnapshot): boolean {
  if (snapshot.demoRosterVersion === 1) return false;
  for (const winner of winners) {
    const person = snapshot.people.find((p) => p.id === winner.id);
    if (person) Object.assign(person, winner, { role: "Hackathon Game Winners" });
  }
  const eya = snapshot.people.find((p) => p.id === IDS.sofia);
  if (eya) Object.assign(eya, { name: "eya babon", initials: "EB", role: "Company Psychologist" });

  snapshot.layout.groups.push(
    { id: winnersId, name: "Hackathon Game Winners", x: 40, y: 280, width: 900, height: 330, collapsed: false },
    { id: psychologistId, name: "Company Psychologist", x: 1020, y: 40, width: 310, height: 320, collapsed: false },
  );
  for (const [index, winner] of winners.entries()) {
    const node = snapshot.layout.people.find((p) => p.id === winner.id);
    if (node) Object.assign(node, { groupId: winnersId, x: 30 + index * 220, y: 85 });
  }
  const eyaNode = snapshot.layout.people.find((p) => p.id === IDS.sofia);
  if (eyaNode) Object.assign(eyaNode, { groupId: psychologistId, x: 70, y: 85 });
  // Remove the old role group only when it no longer contains anyone.
  snapshot.layout.groups = snapshot.layout.groups.filter((g) =>
    g.id !== IDS.video || snapshot.layout.people.some((p) => p.groupId === g.id),
  );
  const designers = snapshot.layout.groups.find((g) => g.id === IDS.design);
  if (designers) Object.assign(designers, { x: 1020, y: 430 });
  snapshot.layout.version = 0; // Fit the newly arranged groups on their first render.
  snapshot.demoRosterVersion = 1;
  return true;
}

export function createDemoWorkspace(): WorkspaceSnapshot {
  const snapshot = seedWorkspace();
  migrateDemoRoster(snapshot);
  return snapshot;
}
