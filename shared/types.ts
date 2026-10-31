export type AccessRole = "employer" | "worker";
export type WorkState =
  | "awaiting_agreement"
  | "in_progress"
  | "submitted"
  | "changes_requested"
  | "accepted";
export type PaymentState =
  | "draft"
  | "unpaid"
  | "pending"
  | "partial"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded"
  | "unknown";
export type Origin = "sample" | "sandbox";
export type Classification = "likely_included" | "potential_extra" | "unclear";
export interface Money {
  minor: string;
  currency: "USD";
}
export interface Person {
  id: string;
  authUserId?: string;
  name: string;
  role: string;
  accessRole: AccessRole;
  email: string;
  color: string;
  initials: string;
  connected: boolean;
}
export interface Agreement {
  id: string;
  status: "draft" | "proposed" | "accepted" | "declined";
  authorId: string;
  baseId: string | null;
  brief: string;
  tasks?: string[];
  deliverables: string[];
  amountMinor: string;
  currency: "USD";
  deadline: string;
  revisionRounds: number;
  paymentDays: number;
  clauses: { id: string; text: string }[];
  createdAt: string;
  acceptedAt?: string;
  acceptedBy?: string;
}
export interface Delivery {
  id: string;
  agreementId: string;
  url: string;
  fileId?: string;
  fileVersion?: number;
  label: string;
  note: string;
  submittedAt: string;
  acceptedAt?: string;
  status: "submitted" | "accepted" | "changes_requested";
}
export interface ScopeItem {
  text: string;
  classification: Classification;
  explanation: string;
  uncertainty: "low" | "medium" | "high";
  sources: { clauseId: string; quote: string }[];
}
export interface ScopeAnalysis {
  items: ScopeItem[];
  questions: string[];
  mode: "demo" | "live";
}
export interface BriefSuggestion {
  tasks: string[];
  deliverables: string[];
  questions: string[];
  mode: "demo" | "live";
}
export interface Revision {
  id: string;
  text: string;
  agreementId: string;
  createdAt: string;
  roundConsumed: boolean;
  items: (ScopeItem & {
    id: string;
    disposition:
      | "awaiting_response"
      | "included"
      | "clarification"
      | "extra_proposed"
      | "resolved";
    note?: string;
  })[];
}
export interface Proposal {
  id: string;
  revisionId: string;
  itemId: string;
  baseAgreementId: string;
  description: string;
  amountMinor: string;
  deadline: string | null;
  status: "pending" | "accepted" | "declined" | "superseded";
  createdAt: string;
  decidedAt?: string;
  authorId: string;
}
export interface Invoice {
  id: string;
  sellerConnectionId: string;
  providerId: string | null;
  number: string;
  amountMinor: string;
  paidMinor: string;
  pendingMinor: string;
  dueDate: string;
  state: PaymentState;
  rawStatus: string;
  recipientUrl: string | null;
  source: Origin;
  chargeIds: string[];
  syncedAt: string;
  error?: string;
}
export interface Activity {
  projectId?: string | null;
  id: string;
  actorId: string;
  text: string;
  createdAt: string;
}
export interface Project {
  id: string;
  workspaceId: string;
  workerId: string;
  title: string;
  state: WorkState;
  origin: Origin;
  activeAgreementId: string | null;
  agreements: Agreement[];
  deliveries: Delivery[];
  revisions: Revision[];
  proposals: Proposal[];
  invoices: Invoice[];
  activity: Activity[];
  version: number;
}
export interface LayoutGroup {
  id: string;
  name: string;
  x: number;
  y: number;
  collapsed: boolean;
  width: number;
  height: number;
}
export interface LayoutPerson {
  id: string;
  groupId: string | null;
  x: number;
  y: number;
}
export interface CanvasLayout {
  schemaVersion: 1;
  version: number;
  groups: LayoutGroup[];
  people: LayoutPerson[];
  cards?: {
    id: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
  }[];
  connections?: { id: string; source: string; target: string }[];
  viewport: { x: number; y: number; zoom: number };
}
export interface WorkspaceSnapshot {
  files?: WorkspaceFile[];
  workspaceActivity?: Activity[];
  demoRosterVersion?: number;
  id: string;
  name: string;
  timezone: string;
  people: Person[];
  projects: Project[];
  layout: CanvasLayout;
  sellerConnectionId: string;
  actorId: string;
}
export interface FileVersion {
  path: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}
export interface WorkspaceFile {
  id: string;
  workspaceId: string;
  projectId: string | null;
  uploadedBy: string;
  name: string;
  mime: string;
  size: number;
  x: number;
  y: number;
  version: number;
  versions: FileVersion[];
  createdAt: string;
  updatedAt: string;
}
export type WorkspaceIntent =
  | "payments"
  | "progress"
  | "organize"
  | "overdue"
  | "spending"
  | "help";
export interface WorkspaceAnswer {
  intent: WorkspaceIntent;
  text: string;
  highlight: string[];
  mode: "live" | "demo";
}
export interface SessionActor {
  id: string;
  role: AccessRole;
  workspaceId: string;
}
