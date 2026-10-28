import type {
  CanvasLayout,
  Person,
  Project,
  WorkspaceSnapshot,
} from "./types.ts";
import { makeAgreement, uid, todayIn } from "./domain.ts";
export const IDS = {
  workspace: "10000000-0000-4000-8000-000000000001",
  myron: "20000000-0000-4000-8000-000000000001",
  ava: "20000000-0000-4000-8000-000000000002",
  leo: "20000000-0000-4000-8000-000000000003",
  mia: "20000000-0000-4000-8000-000000000004",
  nina: "20000000-0000-4000-8000-000000000005",
  ethan: "20000000-0000-4000-8000-000000000006",
  sofia: "20000000-0000-4000-8000-000000000007",
  video: "30000000-0000-4000-8000-000000000001",
  design: "30000000-0000-4000-8000-000000000002",
  seller: "40000000-0000-4000-8000-000000000001",
};
export function seedWorkspace(): WorkspaceSnapshot {
  const now = new Date().toISOString();
  const date = new Date();
  date.setDate(date.getDate() + 10);
  const deadline = todayIn("Asia/Manila", date);
  const people: Person[] = [
    {
      id: IDS.myron,
      name: "Myron",
      role: "Team Lead",
      accessRole: "employer",
      email: "myron@northstar.example",
      initials: "M",
      color: "#b6bce8",
      connected: false,
    },
    {
      id: IDS.ava,
      name: "Ava Cruz",
      role: "Video Editor",
      accessRole: "worker",
      email: "ava@northstar.example",
      initials: "AC",
      color: "#f2d0be",
      connected: true,
    },
    {
      id: IDS.leo,
      name: "Leo Tan",
      role: "Video Editor",
      accessRole: "worker",
      email: "leo@northstar.example",
      initials: "LT",
      color: "#c7d8d2",
      connected: false,
    },
    {
      id: IDS.mia,
      name: "Mia Reyes",
      role: "Video Editor",
      accessRole: "worker",
      email: "mia@northstar.example",
      initials: "MR",
      color: "#e1cce2",
      connected: false,
    },
    {
      id: IDS.nina,
      name: "Nina Flores",
      role: "Graphic Designer",
      accessRole: "worker",
      email: "nina@northstar.example",
      initials: "NF",
      color: "#d4c9ad",
      connected: false,
    },
    {
      id: IDS.ethan,
      name: "Ethan Lim",
      role: "Graphic Designer",
      accessRole: "worker",
      email: "ethan@northstar.example",
      initials: "EL",
      color: "#b8cfdf",
      connected: false,
    },
    {
      id: IDS.sofia,
      name: "Sofia Santos",
      role: "Copywriter",
      accessRole: "worker",
      email: "sofia@northstar.example",
      initials: "SS",
      color: "#e3c2b9",
      connected: false,
    },
  ];
  function project(
    workerId: string,
    title: string,
    amountMinor: string,
    state: Project["state"],
  ): Project {
    const agreement = makeAgreement(
      {
        brief: `Create ${title.toLowerCase()} for Northstar Creative's autumn campaign. Follow the approved brand guide. Correct spelling and technical mistakes. A second concept or alternate ending is outside this brief.`,
        deliverables: [
          title,
          "One final export following the approved brand guide",
          "Spelling corrections and technical fixes",
        ],
        amountMinor,
        currency: "USD",
        deadline,
        revisionRounds: 2,
        paymentDays: 7,
      },
      IDS.myron,
      null,
      now,
    );
    agreement.status = "accepted";
    agreement.acceptedAt = now;
    agreement.acceptedBy = workerId;
    const p: Project = {
      id: uid(),
      workspaceId: IDS.workspace,
      workerId,
      title,
      state,
      origin: "sample",
      activeAgreementId: agreement.id,
      agreements: [agreement],
      deliveries: [],
      revisions: [],
      proposals: [],
      invoices: [],
      activity: [
        {
          id: uid(),
          actorId: IDS.myron,
          text: "Sample project seeded with accepted terms.",
          createdAt: now,
        },
      ],
      version: 0,
    };
    if (state === "submitted" || state === "accepted")
      p.deliveries.push({
        id: uid(),
        agreementId: agreement.id,
        url: "https://drive.google.com/drive/u/0/my-drive",
        label: "v1 · final export",
        note: "Sample delivery link. Replace with your own shared file to review real work.",
        submittedAt: now,
        status: state === "accepted" ? "accepted" : "submitted",
      });
    return p;
  }
  const projects = [
    project(IDS.ava, "Recruitment cut", "12000", "in_progress"),
    project(IDS.leo, "Podcast highlights", "15000", "accepted"),
    project(IDS.mia, "Event recap", "18000", "submitted"),
    project(IDS.nina, "Brand kit", "24000", "accepted"),
    project(IDS.nina, "Social pack", "9000", "in_progress"),
    project(IDS.ethan, "Thumbnails", "8000", "changes_requested"),
    project(IDS.sofia, "Landing copy", "10000", "in_progress"),
  ];
  projects.forEach((p, i) => {
    p.id = "50000000-0000-4000-8000-" + String(i + 1).padStart(12, "0");
  });
  for (const p of projects.filter((p) => p.state === "accepted")) {
    const a = p.agreements[0];
    p.invoices.push({
      id: uid(),
      sellerConnectionId: "sample",
      providerId: null,
      number: p.workerId === IDS.leo ? "SAMPLE-1042" : "SAMPLE-1039",
      amountMinor: a.amountMinor,
      paidMinor: p.workerId === IDS.leo ? "5000" : a.amountMinor,
      pendingMinor: "0",
      dueDate: "2026-01-01",
      state: p.workerId === IDS.leo ? "partial" : "paid",
      rawStatus: "SAMPLE",
      recipientUrl: null,
      source: "sample",
      chargeIds: [a.id],
      syncedAt: now,
    });
  }
  const ethan = projects.find((p) => p.workerId === IDS.ethan)!;
  const revisionId = uid();
  const itemId = uid();
  ethan.revisions.push({
    id: revisionId,
    agreementId: ethan.activeAgreementId!,
    text: "Add five thumbnails in a second visual direction.",
    createdAt: now,
    roundConsumed: false,
    items: [
      {
        id: itemId,
        text: "Five additional thumbnails in a second direction",
        classification: "potential_extra",
        explanation: "A second concept extends the accepted deliverables.",
        uncertainty: "low",
        sources: [
          {
            clauseId: "brief",
            quote:
              "A second concept or alternate ending is outside this brief.",
          },
        ],
        disposition: "extra_proposed",
      },
    ],
  });
  ethan.proposals.push({
    id: uid(),
    revisionId,
    itemId,
    baseAgreementId: ethan.activeAgreementId!,
    description: "Five thumbnails in an additional visual direction",
    amountMinor: "2000",
    deadline,
    status: "pending",
    createdAt: now,
    authorId: IDS.ethan,
  });
  const layout: CanvasLayout = {
    schemaVersion: 1,
    version: 0,
    groups: [
      {
        id: IDS.video,
        name: "Video Editors",
        x: 100,
        y: 290,
        collapsed: false,
        width: 665,
        height: 280,
      },
      {
        id: IDS.design,
        name: "Graphic Designers",
        x: 865,
        y: 330,
        collapsed: true,
        width: 460,
        height: 280,
      },
    ],
    people: [
      { id: IDS.myron, groupId: null, x: 595, y: 40 },
      { id: IDS.ava, groupId: IDS.video, x: 35, y: 85 },
      { id: IDS.leo, groupId: IDS.video, x: 245, y: 85 },
      { id: IDS.mia, groupId: IDS.video, x: 455, y: 85 },
      { id: IDS.nina, groupId: IDS.design, x: 35, y: 85 },
      { id: IDS.ethan, groupId: IDS.design, x: 245, y: 85 },
      { id: IDS.sofia, groupId: null, x: 1050, y: 55 },
    ],
    viewport: { x: 0, y: 0, zoom: 0.85 },
  };
  return {
    id: IDS.workspace,
    name: "Northstar Creative",
    timezone: "Asia/Manila",
    people,
    projects,
    layout,
    sellerConnectionId: IDS.seller,
    actorId: IDS.myron,
  };
}
