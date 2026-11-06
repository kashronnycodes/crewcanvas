import { IDS, seedWorkspace } from "./seed.ts";
import type { WorkspaceSnapshot } from "./types.ts";

// A separate namespace from the legacy fixtures and every integrated workspace.
export const demoId = (id: string) => "d" + id.slice(1);
export const DEMO_ACCOUNTS = [
  { key: "employer", id: demoId(IDS.myron), name: "Employer Demo", role: "Employer", description: "Manage projects, agreements, revisions and payment requests." },
  { key: "freelancer-1", id: demoId(IDS.ava), name: "Freelancer Demo 1", role: "Freelancer", description: "Deliver campaign work and respond to a paid revision." },
  { key: "freelancer-2", id: demoId(IDS.leo), name: "Freelancer Demo 2", role: "Freelancer", description: "Explore separate assignments and review a new agreement." },
] as const;
export const DEMO_FILE_ID = "d6000000-0000-4000-8000-000000000001";
export const DEMO_FILE_PATH = "crewcanvas-sample/campaign-deliverable.txt";
export const DEMO_FILE_TEXT = "CrewCanvas synthetic campaign deliverable\n\nConcept: A little structure. A lot of possibility.\nDeliverables: Campaign storyboard and final export outline.\nRevision: A second visual direction requires an additional $20 agreement.\n\nSample data for the public simulated demo.\n";

export function publicDemoWorkspace(): WorkspaceSnapshot {
  const seed = seedWorkspace();
  const revision = seed.projects.find((p) => p.workerId === IDS.ethan)!;
  // Move the existing paid-revision example into Freelancer 1's assigned work.
  const remapped = JSON.parse(JSON.stringify(revision).replaceAll(IDS.ethan, IDS.ava));
  const proposed = seed.projects[0];
  proposed.workerId = IDS.leo;
  proposed.title = "Launch storyboard";
  proposed.state = "awaiting_agreement";
  proposed.activeAgreementId = null;
  proposed.agreements[0].status = "proposed";
  delete proposed.agreements[0].acceptedAt;
  delete proposed.agreements[0].acceptedBy;
  seed.projects = [remapped, seed.projects[1], proposed];
  seed.people = seed.people.slice(0, 3).map((person, index) => ({
    ...person,
    name: index === 0 ? "Demo Employer" : `Demo Freelancer ${index}`,
    email: `${DEMO_ACCOUNTS[index].key}@crewcanvas-demo.example`,
    initials: index === 0 ? "DE" : `F${index}`,
    connected: false,
    role: index === 0 ? "Creative Lead" : index === 1 ? "Designer" : "Video Editor",
  }));
  seed.name = "CrewCanvas Demo Studio";
  seed.layout = {
    schemaVersion: 1, version: 0, groups: [],
    people: seed.people.map((person, i) => ({ id: person.id, groupId: null, x: 120 + i * 300, y: 160 })),
    viewport: { x: 0, y: 0, zoom: 0.8 },
  };
  // Remap every reference, including accepted terms and invoice charge IDs.
  const snapshot: WorkspaceSnapshot = JSON.parse(JSON.stringify(seed), (_key, value) =>
    typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? demoId(value) : value
  );
  const project = snapshot.projects[0];
  const now = new Date().toISOString();
  const size = new TextEncoder().encode(DEMO_FILE_TEXT).length;
  snapshot.files = [{
    id: DEMO_FILE_ID, workspaceId: snapshot.id, projectId: project.id,
    uploadedBy: DEMO_ACCOUNTS[1].id, name: "campaign-deliverable.txt", mime: "text/plain", size,
    x: 180, y: 440, version: 1, createdAt: now, updatedAt: now,
    versions: [{ path: DEMO_FILE_PATH, name: "campaign-deliverable.txt", mime: "text/plain", size, createdAt: now }],
  }];
  project.deliveries = [{
    id: crypto.randomUUID(), agreementId: project.activeAgreementId!,
    url: `crewcanvas-file:${DEMO_FILE_ID}:0`, fileId: DEMO_FILE_ID, fileVersion: 0,
    label: "Campaign concept · v1", note: "Synthetic example deliverable, ready to open.",
    submittedAt: now, status: "changes_requested",
  }];
  return snapshot;
}
