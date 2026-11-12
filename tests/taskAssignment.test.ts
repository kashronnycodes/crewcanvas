import { describe, expect, it } from "vitest";
import { commandSchema } from "../shared/validation";
import { execute } from "../shared/domain";
import { IDS, seedWorkspace } from "../shared/seed";
import { workflowCollections, workflowGraph } from "../shared/workflow";

describe("optional assignment", () => {
  const owner = { id: IDS.myron, workspaceId: IDS.workspace, role: "employer" as const };
  function planningTask() {
    const p = seedWorkspace().projects[0];
    return { ...p, workerId: null, state: "awaiting_agreement" as const, activeAgreementId: null, agreements: [], deliveries: [], invoices: [], proposals: [], revisions: [] };
  }
  it("defaults omitted assignees to null and accepts explicit null without accepting invalid IDs", () => {
    const existing = seedWorkspace().projects[0];
    const create = {type:"createProject",title:"Plan first",terms:existing.agreements[0]};
    // Use only the agreement input fields, not saved agreement metadata.
    const {brief,deliverables,amountMinor,currency,deadline,revisionRounds,paymentDays}=existing.agreements[0];
    expect(commandSchema.parse({...create,terms:{brief,deliverables,amountMinor,currency,deadline,revisionRounds,paymentDays}})).toMatchObject({workerId:null});
    expect(commandSchema.safeParse({type:"assignTask",projectId:existing.id,workerId:""}).success).toBe(false);
  });
  it("changes and clears a planning task without granting worker authority or accepting terms", () => {
    let task = planningTask();
    const assigned = execute(task,{type:"assignTask",projectId:task.id,workerId:IDS.ava},owner);
    expect(assigned.workerId).toBe(IDS.ava);
    expect(task.workerId).toBeNull();
    expect(execute(assigned,{type:"assignTask",projectId:task.id,workerId:null},owner).workerId).toBeNull();
    expect(()=>execute(task,{type:"assignTask",projectId:task.id,workerId:IDS.ava},{...owner,id:IDS.ava,role:"worker"})).toThrow("access");
  });
  it("preserves existing agreed work and invoice history", () => {
    const task = seedWorkspace().projects[0];
    expect(()=>execute(task,{type:"assignTask",projectId:task.id,workerId:null},owner)).toThrow("history");
  });
  it("shows unassigned tasks in overview and detailed project maps", () => {
    const s=seedWorkspace(); s.projects=[planningTask()];
    const collection=workflowCollections(s)[0];
    for (const detailed of [false,true]) {
      expect(workflowGraph(s,collection,()=>{},{detailed}).cards.find(c=>c.task?.id===s.projects[0].id)?.caption).toBe("Unassigned");
    }
  });
});
