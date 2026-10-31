import { describe, expect, it } from "vitest";
import { IDS, seedWorkspace } from "../shared/seed";
import { workspaceAIContext } from "../shared/ai-context";
describe("AI authorization boundary", () => {
  it("strips peer projects, credentials, file paths and emails from worker context", () => {
    const s = seedWorkspace();
    const result = workspaceAIContext(s, {
      id: IDS.ava,
      role: "worker",
      workspaceId: s.id,
    });
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].assignedTo).toBe(
      s.people.find((p) => p.id === IDS.ava)!.name,
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("authUserId");
    expect(serialized).not.toContain("@northstar");
    expect(serialized).not.toContain("recipientUrl");
  });
  it("rejects a snapshot from another workspace", () => {
    expect(() =>
      workspaceAIContext(seedWorkspace(), {
        id: IDS.myron,
        role: "employer",
        workspaceId: crypto.randomUUID(),
      })
    ).toThrow("denied");
  });
});
