import { beforeEach, describe, expect, it } from "vitest";
import {
  repository,
  resetDemo,
  setDemoActor,
  scopeAssistant,
} from "../src/services";
import { IDS } from "../shared/seed";
import { uid } from "../shared/domain";
beforeEach(() => resetDemo());
describe("persistent demo service boundaries", () => {
  it("keeps initial project identifiers stable across reads and mutations", async () => {
    const first = await repository.load();
    const second = await repository.load();
    expect(first.projects.map((p) => p.id)).toEqual(
      second.projects.map((p) => p.id),
    );
    const p = first.projects.find((p) => p.workerId === IDS.leo)!;
    await repository.command(
      {
        type: "simulatePayment",
        projectId: p.id,
        invoiceId: p.invoices[0].id,
        state: "paid",
      },
      uid(),
    );
    const changed = await repository.load();
    expect(
      changed.projects.find((x) => x.id === p.id)!.invoices[0].paidMinor,
    ).toBe("15000");
  });
  it("filters worker snapshots and refuses unauthorized layout writes", async () => {
    setDemoActor(IDS.ava);
    const snapshot = await repository.load();
    expect(snapshot.people.map((p) => p.id)).toEqual([IDS.ava]);
    expect(snapshot.projects.every((p) => p.workerId === IDS.ava)).toBe(true);
    expect(snapshot.layout.people).toEqual([]);
    await expect(repository.saveLayout(snapshot.layout)).rejects.toThrow(
      "employer",
    );
  });
  it("deduplicates repeated commands", async () => {
    const s = await repository.load();
    const p = s.projects[0];
    const requestId = uid();
    const c = {
      type: "discuss" as const,
      projectId: p.id,
      text: "One comment",
    };
    await repository.command(c, requestId);
    await repository.command(c, requestId);
    expect(
      (await repository.load()).projects[0].activity.filter(
        (a) => a.text === "Comment: One comment",
      ),
    ).toHaveLength(1);
  });
  it("labels deterministic scope results and separates mixed feedback", async () => {
    const s = await repository.load();
    const analysis = await scopeAssistant.compare(
      s.projects[0].id,
      "Fix the spelling at 0:14 and add a second ending",
    );
    expect(analysis.mode).toBe("demo");
    expect(analysis.items.map((i) => i.classification)).toEqual([
      "likely_included",
      "potential_extra",
    ]);
  });
});
