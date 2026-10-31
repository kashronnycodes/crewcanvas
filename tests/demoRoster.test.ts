import { describe, expect, it } from "vitest";
import { seedWorkspace, IDS } from "../shared/seed";
import { migrateDemoRoster } from "../src/demoRoster";

describe("demo roster update", () => {
  it("moves the four winners and Eya into separate groups while preserving projects", () => {
    const snapshot = seedWorkspace();
    const projects = structuredClone(snapshot.projects);
    const identities = snapshot.people.map((p) => [p.id, p.email, p.accessRole, p.connected]);
    migrateDemoRoster(snapshot);
    expect(snapshot.projects).toEqual(projects);
    expect(snapshot.people.map((p) => [p.id, p.email, p.accessRole, p.connected])).toEqual(identities);
    const winners = snapshot.layout.groups.find((g) => g.name === "Hackathon Game Winners")!;
    expect(snapshot.layout.people.filter((p) => p.groupId === winners.id)).toHaveLength(4);
    const eya = snapshot.people.find((p) => p.id === IDS.sofia)!;
    expect(eya.name).toBe("eya babon");
    expect(eya.role).toBe("Company Psychologist");
    const eyaNode = snapshot.layout.people.find((p) => p.id === eya.id)!;
    expect(snapshot.layout.groups.find((g) => g.id === eyaNode.groupId)?.name).toBe("Company Psychologist");
  });
  it("preserves later group edits instead of reapplying the migration", () => {
    const snapshot = seedWorkspace();
    migrateDemoRoster(snapshot);
    snapshot.layout.groups[0].x = 888;
    const edited = structuredClone(snapshot);
    expect(migrateDemoRoster(snapshot)).toBe(false);
    expect(snapshot).toEqual(edited);
  });
});
