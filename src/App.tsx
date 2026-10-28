import InvitationSetup from "./components/InvitationSetup";
import { useCallback, useEffect, useRef, useState } from "react";
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
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { CanvasLayout, Person, WorkspaceSnapshot } from "../shared/types";
import { indicators, todayIn, uid } from "../shared/domain";
import type { Command } from "../shared/validation";
import { IDS } from "../shared/seed";
import {
  inviteMember,
  mode,
  payments,
  repository,
  resetDemo,
  setDemoActor,
  supabase,
} from "./services";
import Avatar from "./components/Avatar";
import Canvas, { StatusBadges } from "./components/Canvas";
import Modal from "./components/Modal";
import ProjectDrawer from "./components/ProjectDrawer";
import ProjectForm from "./components/ProjectForm";
type Filter = "all" | "attention" | "completed";
export default function App() {
  const client = useQueryClient();
  const [authId, setAuthId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(mode === "demo");
  const [actorId, setActorId] = useState(IDS.myron as string);
  const [view, setView] = useState<"canvas" | "list">(() =>
    window.innerWidth < 768 ? "list" : "canvas",
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<
    string | undefined
  >();
  const [filter, setFilter] = useState<Filter>("all");
  const [newProject, setNewProject] = useState(false);
  const [invite, setInvite] = useState(false);
  const [help, setHelp] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [saveStatus, setSaveStatus] = useState("All changes saved");
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const layoutVersion = useRef<number | null>(null);
  useEffect(() => {
    if (mode !== "integrated") return;
    if (!supabase) {
      setAuthReady(true);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setAuthId(data.session?.user.id ?? null);
      setAuthReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthId(session?.user.id ?? null);
      setSelected(null);
      client.removeQueries({ queryKey: ["workspace"] });
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, [client]);
  const key = ["workspace", mode, actorId, authId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => repository.load(),
    enabled: mode === "demo" || (authReady && !!authId),
    refetchInterval: mode === "integrated" ? 15000 : false,
  });
  const snapshot = query.data;
  useEffect(() => {
    if (snapshot) layoutVersion.current = snapshot.layout.version;
  }, [snapshot?.layout.version]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timeout);
  }, [toast]);
  const notify = useCallback((message: string) => setToast(message), []);
  const onSelect = useCallback(
    (id: string, nextFilter: Filter = "all", projectId?: string) => {
      setSelected(id);
      setFilter(nextFilter);
      setSelectedProjectId(projectId);
    },
    [],
  );
  const saveLayout = useCallback(
    async (layout: CanvasLayout) => {
      setSaveStatus("Saving…");
      const task = saveQueue.current
        .catch(() => {})
        .then(async () => {
          try {
            const saved = await repository.saveLayout({
              ...layout,
              version: layout.version,
            });
            layoutVersion.current = saved.version;
            client.setQueriesData<WorkspaceSnapshot>(
              { queryKey: ["workspace", mode] },
              (old) => (old ? { ...old, layout: saved } : old),
            );
            setSaveStatus("All changes saved");
            return saved;
          } catch (error) {
            setSaveStatus("Save failed · reload to retry");
            notify((error as Error).message);
            throw error;
          }
        });
      saveQueue.current = task;
      return task;
    },
    [client, notify],
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
  )
    return <InvitationSetup />;
  if (mode === "integrated" && authReady && !authId)
    return <Login onNotify={notify} />;
  if (!snapshot)
    return (
      <div className="loading-screen">
        <Brand />
        {query.error ? (
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
                onClick={() => void supabase?.auth.signOut()}
              >
                Sign out
              </button>
            )}
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={28} />
            <p>Making room for good work…</p>
          </>
        )}
      </div>
    );
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
  const inProgress = snapshot.projects.filter((p) =>
    ["in_progress", "changes_requested"].includes(p.state),
  ).length;
  const filteredWorkers = workers.filter((p) =>
    `${p.name} ${p.role} ${snapshot.projects
      .filter((x) => x.workerId === p.id)
      .map((x) => x.title)
      .join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selectedPerson = snapshot.people.find((p) => p.id === selected);
  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <span className="topbar-divider" />
        <button className="workspace-switch" onClick={() => setHelp(true)}>
          <span className="workspace-monogram">
            N<span>✦</span>
          </span>
          <span>{snapshot.name}</span>
          <ChevronDown size={13} />
        </button>
        <div className="topbar-center">
          <span className="live-dot" /> A little clarity for your creative world
        </div>
        <div className="topbar-right">
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
              const p = snapshot.projects.find((p) =>
                p.invoices.some(
                  (i) => i.state !== "paid" && i.paidMinor !== i.amountMinor,
                ),
              );
              if (p) onSelect(p.workerId, "attention");
              else notify("You’re all caught up.");
            }}
          >
            <Bell size={19} />
            {counts.attention > 0 && <i />}
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
        {mode === "demo" ? (
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
                [IDS.ava]: "Ava · Worker",
                [IDS.leo]: "Leo · Worker",
                [IDS.mia]: "Mia · Worker",
                [IDS.nina]: "Nina · Worker",
                [IDS.ethan]: "Ethan · Worker",
                [IDS.sofia]: "Sofia · Worker",
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
        ) : (
          <button onClick={() => void supabase?.auth.signOut()}>
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
                  ? "Team workspace"
                  : `Your work, ${actor.name.split(" ")[0]}.`}{" "}
                <span>✦</span>
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
                  ["in_progress", "changes_requested"].includes(p.state),
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
                Canvas
              </button>
              <button
                aria-pressed={view === "list" || !employer}
                className={view === "list" || !employer ? "selected" : ""}
                onClick={() => setView("list")}
              >
                <List size={16} />
                List
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
          {employer && view === "canvas" ? (
            <Canvas
              snapshot={snapshot}
              onSelect={onSelect}
              onSave={saveLayout}
              saveStatus={saveStatus}
              search={search}
              onNotify={notify}
              onInvite={() => setInvite(true)}
              selectedPersonId={selected ?? undefined}
            />
          ) : (
            <div className="people-list">
              <div className="list-heading">
                <h2>
                  {employer
                    ? "The people making it happen"
                    : "Your project space"}
                </h2>
                <span>
                  {filteredWorkers.length} {employer ? "members" : "member"}
                </span>
              </div>
              <div className="people-grid">
                {filteredWorkers.map((p) => (
                  <div className="person-card" key={p.id}>
                    <button
                      className="person-card-main"
                      onClick={() => onSelect(p.id)}
                    >
                      <Avatar person={p} size={60} />
                      <div>
                        <h3>{p.name}</h3>
                        <p>{p.role}</p>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                    <div className="card-projects">
                      {snapshot.projects
                        .filter((project) => project.workerId === p.id)
                        .map((project) => (
                          <button
                            key={project.id}
                            onClick={() => onSelect(p.id, "all", project.id)}
                          >
                            <span
                              className={`project-dot state-${project.state}`}
                            />
                            {project.title}
                            <ArrowRight size={12} />
                          </button>
                        ))}
                    </div>
                    <div className="person-card-footer">
                      <span>
                        {
                          snapshot.projects.filter(
                            (project) => project.workerId === p.id,
                          ).length
                        }{" "}
                        projects
                      </span>
                      <StatusBadges
                        projects={snapshot.projects}
                        workerIds={[p.id]}
                        today={today}
                        onClick={(filter) => onSelect(p.id, filter)}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {!filteredWorkers.length && (
                <div className="empty-state">
                  <Search size={30} />
                  <h3>No people or projects found</h3>
                  <p>Try a name, role, or project title.</p>
                </div>
              )}
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              <span className="footer-spark">✦</span> A little structure. A lot
              of possibility.
            </span>
            <span>Made for the way creative teams work.</span>
          </footer>
        </main>
      </div>
      {selectedPerson && (
        <ProjectDrawer
          key={`${selectedPerson.id}-${filter}`}
          person={selectedPerson}
          snapshot={snapshot}
          initialFilter={filter}
          initialProjectId={selectedProjectId}
          onClose={() => setSelected(null)}
          onCommand={command}
          onIssue={(id) =>
            run(
              () => payments.issue(id, uid()),
              mode === "demo"
                ? "Simulated invoice created. No transaction occurred."
                : "Sandbox invoice created and sent.",
            )
          }
          onRefresh={(id) =>
            run(() => payments.reconcile(id), "Invoice reconciled with PayPal.")
          }
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
          description="CrewCanvas · Northstar Creative"
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
                : "You are authenticated. Only Ava has a connected sandbox seller. Other historical payments are sample data. Full multi-seller onboarding is outside this build."}
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
        {!supabase ? (
          <div className="info-note">
            Integrated mode requires VITE_SUPABASE_URL and
            VITE_SUPABASE_PUBLISHABLE_KEY. Add them to .env and restart the
            application.
          </div>
        ) : (
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
