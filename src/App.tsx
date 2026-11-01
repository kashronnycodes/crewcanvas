import InvitationSetup from "./components/InvitationSetup";
import AccountGate from "./components/AccountGate";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clapperboard,
  LayoutGrid,
  List,
  LoaderCircle,
  LogOut,
  Moon,
  PenTool,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Sun,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { CanvasLayout, Person, WorkspaceSnapshot } from "../shared/types";
import type { ProjectTab } from "../shared/freelance-canvas";
import { indicators, todayIn, uid } from "../shared/domain";
import type { Command } from "../shared/validation";
import { IDS } from "../shared/seed";
import {
  api,
  inviteMember,
  mode,
  payments,
  repository,
  resetDemo,
  setDemoActor,
  signOutSession,
  supabase,
} from "./services";
import Avatar from "./components/Avatar";
import Modal from "./components/Modal";
import ProjectDrawer from "./components/ProjectDrawer";
import ProjectForm from "./components/ProjectForm";
import { LayoutSaveQueue } from "./layoutQueue";
import { useTheme } from "./theme";
import FocusCanvas from "./components/FocusCanvas";
import ProjectIndex from "./components/ProjectIndex";
const Canvas = lazy(() => import("./components/Canvas"));
const ProjectBoard = lazy(() => import("./components/ProjectBoard"));
type Filter = "all" | "attention" | "completed";
export default function App() {
  return mode === "integrated"
    ? (
      <AccountGate>
        {(authId, workspaceId, choose) => (
          <WorkspaceApp
            authId={authId}
            workspaceId={workspaceId}
            chooseWorkspace={choose}
          />
        )}
      </AccountGate>
    )
    : <WorkspaceApp />;
}
function WorkspaceApp(
  { authId = null, workspaceId = null, chooseWorkspace }: {
    authId?: string | null;
    workspaceId?: string | null;
    chooseWorkspace?: () => void;
  },
) {
  const client = useQueryClient();

  const authReady = true;
  const [actorId, setActorId] = useState(IDS.myron as string);
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState<"canvas" | "list" | "board">(() =>
    window.innerWidth < 768 ? "list" : "canvas"
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<
    string | undefined
  >();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedTab, setSelectedTab] = useState<ProjectTab>("overview");
  const [newProject, setNewProject] = useState(false);
  const [invite, setInvite] = useState(false);
  const [help, setHelp] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [saveStatus, setSaveStatus] = useState("All changes saved");
  const saveQueue = useRef(new LayoutSaveQueue());
  const key = ["workspace", mode, actorId, authId, workspaceId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => repository.load(),
    enabled: mode === "demo" || (authReady && !!authId),
    refetchInterval: mode === "integrated" ? 15000 : false,
  });
  const snapshot = query.data;
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timeout);
  }, [toast]);
  const notify = useCallback((message: string) => setToast(message), []);
  const onSelect = useCallback(
    (
      id: string,
      nextFilter: Filter = "all",
      projectId?: string,
      tab: ProjectTab = "overview",
    ) => {
      document.dispatchEvent(new Event("crewcanvas:exit-focus"));
      setSelected(id);
      setFilter(nextFilter);
      setSelectedProjectId(projectId);
      setSelectedTab(tab);
    },
    [],
  );
  const saveLayout = useCallback(
    async (layout: CanvasLayout) => {
      setSaveStatus("Saving…");
      return saveQueue.current.save(layout, async (queued) => {
        try {
          const saved = await repository.saveLayout(queued);
          client.setQueriesData<WorkspaceSnapshot>(
            { queryKey: ["workspace", mode] },
            (
              old,
            ) => (old && (mode === "demo" || old.id === workspaceId)
              ? { ...old, layout: saved }
              : old),
          );
          setSaveStatus("All changes saved");
          return saved;
        } catch (error) {
          setSaveStatus("Save failed · reload to retry");
          notify((error as Error).message);
          throw error;
        }
      });
    },
    [client, notify, workspaceId],
  );
  async function run(
    action: () => Promise<unknown>,
    message?: string,
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["workspace"] });
      if (message) notify(message);
      return true;
    } catch (error) {
      notify((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const command = (c: Command) =>
    run(
      () => repository.command(c, uid()),
      c.type === "createProject"
        ? "Agreement proposed. The worker can review and accept it."
        : undefined,
    );
  if (
    mode === "integrated" &&
    authId &&
    new URLSearchParams(window.location.search).get("invite") === "1"
  ) {
    return <InvitationSetup />;
  }
  if (mode === "integrated" && authReady && !authId) {
    return <Login onNotify={notify} />;
  }
  if (!snapshot) {
    return (
      <div className="loading-screen">
        <Brand />
        {query.error
          ? (
            <>
              <h2>Let's get your workspace connected</h2>
              <p>{(query.error as Error).message}</p>
              <button
                className="button primary"
                onClick={() => void query.refetch()}
              >
                Try again
              </button>
              {mode === "integrated" && (
                <button
                  className="button secondary"
                  onClick={() =>
                    void signOutSession().catch((e) => notify(e.message))}
                >
                  Sign out
                </button>
              )}
            </>
          )
          : (
            <>
              <LoaderCircle className="spin" size={28} />
              <p>Making room for good work…</p>
            </>
          )}
      </div>
    );
  }
  const actor = snapshot.people.find((p) => p.id === snapshot.actorId)!;
  const employer = actor.accessRole === "employer";
  const workers = snapshot.people.filter((p) => p.accessRole === "worker");
  const today = todayIn(snapshot.timezone);
  const counts = indicators(
    snapshot.projects,
    workers.map((p) => p.id),
    today,
  );
  const pendingReview = snapshot.projects.filter(
    (p) => p.state === "submitted",
  ).length;
  const inProgress =
    snapshot.projects.filter((p) =>
      ["in_progress", "changes_requested"].includes(p.state)
    ).length;
  const filteredWorkers = workers.filter((p) =>
    `${p.name} ${p.role} ${
      snapshot.projects
        .filter((x) => x.workerId === p.id)
        .map((x) => x.title)
        .join(" ")
    }`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const selectedPerson = snapshot.people.find((p) => p.id === selected);
  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <span className="topbar-divider" />
        <button
          className="workspace-switch"
          disabled={busy || saveStatus === "Saving…"}
          onClick={chooseWorkspace ?? (() => setHelp(true))}
        >
          <span className="workspace-monogram">
            {snapshot.name.trim()[0]}
            <span>✦</span>
          </span>
          <span>{snapshot.name}</span>
          <ChevronDown size={13} />
        </button>
        <div className="topbar-center">
          Organize. Create. Deliver. Get paid.
        </div>
        <div className="topbar-right">
          <button
            className="icon-button"
            aria-label={`Switch to ${
              theme === "light" ? "dark" : "light"
            } mode`}
            onClick={toggleTheme}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            className="icon-button help-button"
            aria-label="About CrewCanvas"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="icon-button notification-button"
            aria-label="Show items needing attention"
            onClick={() => {
              if (mode === "integrated") {
                setInbox(true);
                return;
              }
              const p = snapshot.projects.find((p) => p.invoices.some(
                (i) => i.state !== "paid" && i.paidMinor !== i.amountMinor,
              ));
              if (p) onSelect(p.workerId, "attention");
              else notify("You’re all caught up.");
            }}
          >
            <Bell size={19} />
            {(mode === "integrated"
              ? snapshot.notifications?.some((n) => !n.read_at)
              : counts.attention > 0) && <i />}
          </button>
          <span className="topbar-divider" />
          <button
            className="user-avatar"
            aria-label={`${actor.name} menu`}
            onClick={() => setHelp(true)}
          >
            <Avatar person={actor} size={33} />
          </button>
        </div>
      </header>
      <div className="mode-banner">
        <span>
          <span className="demo-dot" />
          {mode === "demo" ? "Interactive demo" : "Integrated · Sandbox"}
          <span className="banner-separator">/</span>
          {mode === "demo"
            ? "AI responses and payments are simulated. Your changes save in this browser."
            : "Authenticated workspace. Historical fixtures are labeled Sample data."}
        </span>
        {mode === "demo"
          ? (
            <div>
              <label htmlFor="demo-actor">Viewing as</label>
              <select
                id="demo-actor"
                aria-label="Demo viewing role"
                value={actorId}
                onChange={(e) => {
                  setDemoActor(e.target.value);
                  setActorId(e.target.value);
                  setSelected(null);
                  setSearch("");
                }}
              >
                {Object.entries({
                  [IDS.myron]: "Myron · Employer",
                  [IDS.ava]: "Jacob · Worker",
                  [IDS.leo]: "Vincent · Worker",
                  [IDS.mia]: "Jeshua · Worker",
                  [IDS.nina]: "Myron Manago · Worker",
                  [IDS.ethan]: "Ethan · Worker",
                  [IDS.sofia]: "Eya · Worker",
                }).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                title="Reset local demo"
                aria-label="Reset local demo"
                onClick={() => setResetOpen(true)}
              >
                <RotateCcw size={13} />
              </button>
            </div>
          )
          : (
            <button
              onClick={() =>
                void signOutSession().catch((e) => notify(e.message))}
            >
              <LogOut size={13} />
              Sign out
            </button>
          )}
      </div>
      <div className="workspace-content">
        <aside className="sidebar">
          <div className="sidebar-top">
            <button
              className="sidebar-active"
              title="People & projects"
              aria-label="People and projects"
              onClick={() => setView("canvas")}
            >
              <Users size={21} />
            </button>
            <button
              title="Project list"
              aria-label="Project list"
              onClick={() => setView("list")}
            >
              <LayoutGrid size={20} />
            </button>
            <button
              title="Review queue"
              aria-label="Review queue"
              onClick={() => {
                const p = snapshot.projects.find(
                  (p) => p.state === "submitted",
                );
                if (p) onSelect(p.workerId);
                else notify("No deliveries waiting for review.");
              }}
            >
              <Clapperboard size={20} />
              {pendingReview > 0 && <i />}
            </button>
          </div>
          <div className="sidebar-bottom">
            <button
              title="Workspace guide"
              aria-label="Workspace guide"
              onClick={() => setHelp(true)}
            >
              <Sparkles size={20} />
            </button>
            <button
              title="Workspace settings"
              aria-label="Workspace settings"
              onClick={() => setHelp(true)}
            >
              <Settings2 size={20} />
            </button>
            <div className="sidebar-brand">
              N<span>✦</span>
            </div>
          </div>
        </aside>
        <main
          className={`main-workspace ${selectedPerson ? "drawer-visible" : ""}`}
        >
          <div className="workspace-toolbar">
            <div className="page-heading">
              <div className="breadcrumb">
                WORKSPACE <span>/</span> PEOPLE & PROJECTS
              </div>
              <h1>
                {employer
                  ? "People. Projects. Possibilities."
                  : `Your work, ${actor.name.split(" ")[0]}.`}
              </h1>
              <p>
                {employer
                  ? "A shared picture of who’s creating what, and what comes next."
                  : "Clear agreements. Thoughtful feedback. Everything in one place."}
              </p>
            </div>
            <div className="toolbar-actions">
              <button
                className="button secondary invite-button"
                onClick={() => (employer ? setInvite(true) : setHelp(true))}
              >
                <UserPlus size={16} />
                {employer ? "Invite member" : "Workspace guide"}
              </button>
              {employer && (
                <button
                  className="button primary"
                  onClick={() => setNewProject(true)}
                >
                  <Plus size={17} />
                  New project
                </button>
              )}
            </div>
          </div>
          <div className="workspace-summary">
            <button
              className="summary-item"
              onClick={() => {
                setSearch("");
                setView("list");
              }}
            >
              <span className="summary-icon blue">
                <Users size={16} />
              </span>
              <strong>
                {employer ? workers.length : snapshot.projects.length}
              </strong>
              <span>{employer ? "creative people" : "assigned projects"}</span>
            </button>
            <span className="summary-divider" />
            <button
              className="summary-item"
              onClick={() => {
                const p = snapshot.projects.find((p) =>
                  ["in_progress", "changes_requested"].includes(p.state)
                );
                if (p) onSelect(p.workerId);
              }}
            >
              <span className="summary-icon lavender">
                <Clapperboard size={16} />
              </span>
              <strong>{inProgress}</strong>
              <span>in the making</span>
            </button>
            <span className="summary-divider" />
            <button
              className="summary-item"
              onClick={() => {
                const p = snapshot.projects.find(
                  (p) => p.state === "submitted",
                );
                if (p) onSelect(p.workerId);
                else notify("No deliveries waiting for review.");
              }}
            >
              <span className="summary-icon amber">
                <ClockIcon />
              </span>
              <strong>{pendingReview}</strong>
              <span>ready for review</span>
            </button>
            <span className="summary-divider" />
            <button
              className="summary-item attention-summary"
              onClick={() => {
                const p = snapshot.projects.find(
                  (p) => indicators([p], [p.workerId], today).attention,
                );
                if (p) onSelect(p.workerId, "attention");
                else notify("No payment items need attention.");
              }}
            >
              <span className="summary-icon red">
                <AlertCircle size={16} />
              </span>
              <strong>{counts.attention}</strong>
              <span>payment attention</span>
              {counts.attention > 0 && <ArrowUpRight size={14} />}
            </button>
            <div className="summary-spacer" />
            <span className="workspace-private">
              <ShieldIcon /> Private workspace
            </span>
          </div>
          <div className="canvas-nav">
            <div className="view-toggle" aria-label="Workspace view">
              <button
                aria-pressed={view === "canvas" && employer}
                className={view === "canvas" && employer ? "selected" : ""}
                onClick={() => setView("canvas")}
                disabled={!employer}
              >
                <LayoutGrid size={15} />
                Work map
              </button>
              <button
                aria-pressed={view !== "board" &&
                  (view === "list" || !employer)}
                className={view !== "board" && (view === "list" || !employer)
                  ? "selected"
                  : ""}
                onClick={() => setView("list")}
              >
                <List size={16} />
                Projects
              </button>
              <button
                aria-pressed={view === "board"}
                className={view === "board" ? "selected" : ""}
                onClick={() => setView("board")}
              >
                <PenTool size={15} /> Project whiteboard
              </button>
            </div>
            <span className="canvas-nav-label">
              {employer ? "Your team, your way" : "Your assigned projects"}
            </span>
            <div className="search-field">
              <Search size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find people or projects…"
                aria-label="Search people and projects"
              />
              <kbd>/</kbd>
            </div>
          </div>
          <Suspense
            fallback={
              <div className="empty-state" role="status">
                Opening your visual workspace…
              </div>
            }
          >
            {view === "board"
              ? (
                <ProjectBoard
                  snapshot={snapshot}
                  onOpen={onSelect}
                  notify={notify}
                />
              )
              : employer && view === "canvas"
              ? (
                <FocusCanvas>
                  <Canvas
                    snapshot={snapshot}
                    onSelect={onSelect}
                    onSave={saveLayout}
                    saveStatus={saveStatus}
                    search={search}
                    onNotify={notify}
                    onInvite={() => setInvite(true)}
                    selectedPersonId={selected ?? undefined}
                    onCommand={command}
                    busy={busy}
                  />
                </FocusCanvas>
              )
              : (
                <div className="people-list">
                  <ProjectIndex
                    snapshot={snapshot}
                    search={search}
                    onOpen={onSelect}
                  />
                </div>
              )}
          </Suspense>
          <footer className="workspace-footer">
            <span>
              <span className="footer-spark">✦</span>{" "}
              A little structure. A lot of possibility.
            </span>
            <span>Made for the way creative teams work.</span>
          </footer>
        </main>
      </div>
      {selectedPerson && (
        <ProjectDrawer
          key={`${selectedPerson.id}-${filter}-${selectedProjectId}-${selectedTab}`}
          person={selectedPerson}
          snapshot={snapshot}
          initialFilter={filter}
          initialProjectId={selectedProjectId}
          initialTab={selectedTab}
          onClose={() => setSelected(null)}
          onCommand={command}
          onIssue={(id) =>
            run(
              () => payments.issue(id, uid()),
              mode === "demo"
                ? "Simulated invoice created. No transaction occurred."
                : "Sandbox invoice created and sent.",
            )}
          onRefresh={(id) =>
            run(
              () => payments.reconcile(id),
              "Invoice reconciled with PayPal.",
            )}
          busy={busy}
          onNotify={notify}
        />
      )}
      {newProject && (
        <ProjectForm
          people={snapshot.people}
          onClose={() => setNewProject(false)}
          onSubmit={command}
        />
      )}
      {invite && (
        <Invitation onClose={() => setInvite(false)} onNotify={notify} />
      )}
      {inbox && (
        <Modal
          title="Notifications"
          description="Updates from your workspace"
          onClose={() => setInbox(false)}
        >
          {(snapshot.notifications ?? []).length === 0
            ? <p>You're all caught up.</p>
            : (snapshot.notifications ?? []).map((n) => (
              <div className="info-note" key={n.id}>
                <p>{n.text}</p>
                <small>{new Date(n.created_at).toLocaleString()}</small>
                {!n.read_at && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() => api("notifications/read", { id: n.id }))}
                  >
                    Mark as read
                  </button>
                )}
                {n.project_id && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      const p = snapshot.projects.find((p) =>
                        p.id === n.project_id
                      );
                      if (p) {
                        onSelect(p.workerId, "all", p.id);
                        setInbox(false);
                      }
                    }}
                  >
                    Open project
                  </button>
                )}
              </div>
            ))}
        </Modal>
      )}
      {resetOpen && (
        <Modal
          title="A fresh canvas?"
          description="Reset this browser's sample projects, edits, and arrangement. Integrated data and PayPal records are unaffected."
          onClose={() => setResetOpen(false)}
        >
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setResetOpen(false)}
            >
              Keep my changes
            </button>
            <button
              className="button primary"
              onClick={() => {
                resetDemo();
                saveQueue.current.reset();
                setActorId(IDS.myron);
                setSelected(null);
                setResetOpen(false);
                setSearch("");
                void client.invalidateQueries({ queryKey: ["workspace"] });
                notify("A fresh canvas. Demo restored.");
              }}
            >
              Restore demo
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="A clearer picture of your creative team"
          description={`CrewCanvas · ${snapshot.name}`}
          onClose={() => setHelp(false)}
        >
          <div className="help-content">
            <p>
              Organize your people, agree on the work, and keep every delivery
              and payment in view.
            </p>
            <div className="help-row">
              <Users size={21} />
              <p>
                <strong>Make the canvas yours</strong>Drag people and groups.
                Collapse a team without losing its arrangement. Use the +
                control to organize members.
              </p>
            </div>
            <div className="help-row">
              <CheckCircle2 size={21} />
              <p>
                <strong>Agree before moving forward</strong>New terms and extra
                work need acceptance. Accepted terms stay in your project
                history.
              </p>
            </div>
            <div className="help-row">
              <AlertCircle size={21} />
              <p>
                <strong>Know what needs attention</strong>Green means accepted
                work. Red means an actionable payment item. Both can appear
                together.
              </p>
            </div>
            <div className="info-note">
              {mode === "demo"
                ? "You are in a local demo. The role selector demonstrates workflows; it is not authentication. AI is deterministic and all payment actions are simulated."
                : "You are authenticated. Invoicing requires the configured Sandbox seller. Historical sample payments are labeled separately. Multi-seller onboarding and automatic Payouts are not available."}
            </div>
            <button className="button primary" onClick={() => setHelp(false)}>
              Back to the canvas
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {busy && (
        <div className="busy-indicator" role="status">
          <LoaderCircle size={15} className="spin" />
          Saving your changes…
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>
        Crew<span>Canvas</span>
      </span>
    </div>
  );
}
function ClockIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 6v4l3 2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 2 3 5v5q0 5 7 8 7-3 7-8V5Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="m7 10 2 2 4-4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
function Invitation({
  onClose,
  onNotify,
}: {
  onClose: () => void;
  onNotify: (s: string) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Video Editor");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Good people make great work"
      description="Invite a worker to Northstar Creative. Invitations never grant employer access."
      onClose={onClose}
    >
      <form
        className="stacked-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const result = await inviteMember(email, name, role);
            setResult(result.url || result.message);
            await client.invalidateQueries({ queryKey: ["workspace"] });
          } catch (e) {
            onNotify((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </label>
        <label>
          Email address
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Display role
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            required
            maxLength={80}
          />
        </label>
        <button className="button primary" disabled={busy}>
          <UserPlus size={16} />
          {mode === "demo" ? "Simulate invitation" : "Generate invitation link"}
        </button>
        {result && (
          <div className="info-note">
            <p>{result}</p>
            {mode === "integrated" && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  void navigator.clipboard.writeText(result);
                  onNotify(
                    "Invitation link copied. Share it directly with the intended worker.",
                  );
                }}
              >
                Copy link
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
function Login({ onNotify }: { onNotify: (s: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const invite =
    new URLSearchParams(window.location.search).get("invite") === "1";
  return (
    <div className="login-screen">
      <Brand />
      <div className="login-card">
        <span className="eyebrow">A SPACE FOR GOOD WORK</span>
        <h1>
          {invite ? "Make yourself at home." : "Welcome back to your canvas."}
        </h1>
        <p>Clear agreements. Connected people. Room to create.</p>
        {!supabase
          ? (
            <div className="info-note">
              Integrated mode requires VITE_SUPABASE_URL and
              VITE_SUPABASE_PUBLISHABLE_KEY. Add them to .env and restart the
              application.
            </div>
          )
          : (
            <form
              className="stacked-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  const { error } = await supabase!.auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (error) throw error;
                  onNotify("Welcome back.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Email address
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  minLength={8}
                />
              </label>
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <button className="button primary" disabled={busy}>
                Open your workspace
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        <small>Authenticated workspace · PayPal sandbox only</small>
      </div>
      <span className="login-footer">
        A little structure. A lot of possibility.
      </span>
    </div>
  );
}
