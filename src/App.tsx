import { useQuery,useQueryClient } from "@tanstack/react-query";
import { Bell,ChevronDown,LoaderCircle,Moon,Search,Sun,UserPlus,X } from "lucide-react";
import { Suspense,useCallback,useEffect,useRef,useState } from "react";
import { uid } from "../shared/domain";
import type { CanvasLayout,WorkspaceSnapshot } from "../shared/types";
import type { Command } from "../shared/validation";
import AccountGate from "./components/AccountGate";
import Avatar from "./components/Avatar";
import Modal from "./components/Modal";
import StudioWorkspace from "./components/StudioWorkspace";
import WorkspaceSettings from "./components/WorkspaceSettings";
import { LayoutSaveQueue } from "./layoutQueue";
import { api,inviteMember,payments,repository,signOutSession } from "./services";
import { useTheme } from "./theme";

export default function App() {
  return <AccountGate>{(authId, workspaceId, choose) =>
    <WorkspaceApp key={`${authId}:${workspaceId}`} authId={authId} workspaceId={workspaceId} chooseWorkspace={choose} />
  }</AccountGate>;
}
function WorkspaceApp({ authId, workspaceId, chooseWorkspace }: {
  authId: string; workspaceId: string; chooseWorkspace: () => void;
}) {
  const client = useQueryClient();
  const [theme, toggleTheme] = useTheme();
  const [view, setView] = useState<"studio" | "board">("studio");
  const [search, setSearch] = useState("");
  const [invite, setInvite] = useState(false);
  const [invitationRole, setInvitationRole] = useState<string>();
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [inbox, setInbox] = useState(false);
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!workspaceMenu) return;
    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setWorkspaceMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [workspaceMenu]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [approval, setApproval] = useState<{command:Extract<Command,{type:"acceptDelivery"}>;requestId:string;resolve:(ok:boolean)=>void} | null>(null);
  const approvalPending = useRef(false);
  const [approvalError,setApprovalError] = useState("");
  const [saveStatus, setSaveStatus] = useState("All changes saved");
  const saveQueue = useRef(new LayoutSaveQueue());
  const query = useQuery({
    queryKey: ["workspace", authId, workspaceId],
    queryFn: () => repository.load(), refetchInterval: 15000,
  });
  const snapshot = query.data;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = useCallback((message: string) => setToast(message), []);
  const saveLayout = useCallback(async (layout: CanvasLayout) => {
    setSaveStatus("Saving…");
    return saveQueue.current.save(layout, async queued => {
      try {
        const saved = await repository.saveLayout(queued);
        client.setQueriesData<WorkspaceSnapshot>({ queryKey: ["workspace", authId, workspaceId] },
          old => old?.id === workspaceId ? { ...old, layout: saved } : old);
        setSaveStatus("All changes saved");
        return saved;
      } catch (error) {
        setSaveStatus("Could not save. Try again.");
        notify((error as Error).message);
        throw error;
      }
    });
  }, [client, notify, authId, workspaceId]);
  async function run(action: () => Promise<unknown>, message?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      await action();
      await client.invalidateQueries({ queryKey: ["workspace"] });
      if (message) notify(message);
      return true;
    } catch (error) { notify((error as Error).message); return false; }
    finally { setBusy(false); }
  }
  const command = (c: Command): Promise<boolean> => {
    if (c.type === "acceptDelivery") {
      if (approvalPending.current) return Promise.resolve(false);
      approvalPending.current = true;
      setApprovalError("");
      return new Promise(resolve => setApproval({command:c,requestId:uid(),resolve}));
    }
    return run(() => repository.command(c, uid()), c.type === "createProject" ? "Task created. The freelancer can review the terms." : undefined);
  };
  function cancelApproval() {
    if (busy) return;
    approval?.resolve(false);setApproval(null);approvalPending.current=false;setApprovalError("");
  }
  if (!snapshot) return <div className="loading-screen">
    <Brand />{query.error ? <>
      <h1>Could not load workspace</h1><p role="alert">{query.error.message}</p>
      <button className="button primary" onClick={() => void query.refetch()}>Try again</button>
      <button className="button secondary" onClick={chooseWorkspace}>Workspaces</button>
      <button className="text-button" onClick={() => void signOutSession().catch(e => notify(e.message))}>Sign out</button>
    </> : <p role="status">Loading workspace…</p>}
    {toast && <p role="alert">{toast}</p>}
  </div>;
  const actor = snapshot.people.find(p => p.id === snapshot.actorId)!;
  const employer = actor.accessRole === "employer";
  return <div className="app-shell">
    <a className="skip-link" href="#workspace-main">Skip to workspace</a>
    <header className="topbar">
      <Brand />
      <button className="workspace-switch" disabled={busy || saveStatus === "Saving…"} onClick={chooseWorkspace} aria-label={`Switch workspace: ${snapshot.name}`}>
        <span>{snapshot.name}</span><ChevronDown size={15} />
      </button>
      <div className="topbar-right">
        <button className="icon-button" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} onClick={toggleTheme}>
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>
        <button className="icon-button notification-button" aria-label="Notifications" onClick={() => setInbox(true)}>
          <Bell size={19} />{snapshot.notifications?.some(n => !n.read_at) && <i />}
        </button>
        <div className="workspace-menu-wrap" ref={menuRef}>
          <button className="button secondary workspace-menu-trigger" aria-label="Workspace menu" aria-expanded={workspaceMenu} aria-controls="workspace-menu" onClick={() => setWorkspaceMenu(v => !v)}>
            <Avatar person={actor} size={26} /><span>Workspace menu</span><ChevronDown size={14} />
          </button>
          {workspaceMenu && <div id="workspace-menu" className="workspace-menu" onKeyDown={e => {
            if (e.key === "Escape") { setWorkspaceMenu(false); document.querySelector<HTMLButtonElement>(".workspace-menu-trigger")?.focus(); }
          }}>
            <strong>{actor.name}</strong>
            {employer && <button onClick={() => { setWorkspaceMenu(false); setInvite(true); }}>Invite member</button>}
            {employer && <button onClick={() => { setWorkspaceMenu(false); setSettings(true); }}>Settings</button>}
            <button disabled={busy || saveStatus === "Saving…"} onClick={() => { setWorkspaceMenu(false); chooseWorkspace(); }}>Workspaces</button>
            <button onClick={() => { setWorkspaceMenu(false); setHelp(true); }}>Help</button>
            <button onClick={() => void signOutSession().catch(e => notify(e.message))}>Sign out</button>
          </div>}
        </div>
      </div>
    </header>
    <div className="workspace-content">
      <main id="workspace-main" tabIndex={-1} className={`main-workspace ${view === "studio" || view === "board" ? "studio-active" : ""}`}>
        <div className="workspace-toolbar">
          <h1>{view === "board" ? "Project Whiteboard" : employer ? "Project Studio" : "My Tasks"}</h1>
          <span className="save-status" role="status">{saveStatus}</span>
        </div>
        <div className="canvas-nav">
          <nav className="view-toggle" aria-label="Workspace pages">
            {([["studio", employer ? "Project Studio" : "My Tasks"], ["board", "Project Whiteboard"]] as const).map(([id, label]) =>
              <button key={id} aria-current={view === id ? "page" : undefined} className={view === id ? "selected" : ""} onClick={() => setView(id)}>{label}</button>
            )}
          </nav>
          <label className="search-field"><Search size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search work…" aria-label="Search people, projects and tasks" />
          </label>
        </div>
        <Suspense fallback={<p role="status">Loading workspace…</p>}>
          <StudioWorkspace key={`${snapshot.id}:${snapshot.actorId}`} snapshot={snapshot} view={view} search={search}
            onCommand={command} onSaveLayout={saveLayout} busy={busy} notify={notify}
            onInvite={role => { setInvitationRole(role); setInvite(true); }}
            onIssue={id => run(() => payments.issue(id, uid()), "Invoice created and sent.")}
            onRefresh={id => run(() => payments.reconcile(id), "Payment status checked with PayPal.")} />
        </Suspense>
      </main>
    </div>
    {approval && <Modal title="Approve this submission?" description="Are you sure? This marks the selected version as approved. Payment status is tracked separately." onClose={cancelApproval}>
      <p>{snapshot.projects.find(p=>p.id===approval.command.projectId)?.title} · {snapshot.projects.find(p=>p.id===approval.command.projectId)?.deliveries.find(d=>d.id===approval.command.deliveryId)?.label}</p>
      {approvalError && <p role="alert" className="error-message">{approvalError}</p>}
      <div className="button-row">
        <button className="button secondary" disabled={busy} onClick={cancelApproval}>Cancel</button>
        <button className="button primary" disabled={busy} onClick={async()=>{
          const ok=await run(()=>repository.command(approval.command,approval.requestId),"Work approved. Payment status is unchanged.");
          if(ok){approval.resolve(true);setApproval(null);approvalPending.current=false;}
          else setApprovalError("Approval was not saved. Review the workspace message and try again.");
        }}>{busy ? "Approving…" : "Yes, approve work"}</button>
      </div>
    </Modal>}
    {settings && employer && <WorkspaceSettings snapshot={snapshot} onClose={() => setSettings(false)} />}
    {invite && <Invitation initialRole={invitationRole} onClose={() => { setInvite(false); setInvitationRole(undefined); }} onNotify={notify} />}
    {inbox && <Modal title="Notifications" onClose={() => setInbox(false)}>
      {(snapshot.notifications ?? []).length === 0 ? <p>No notifications.</p> : snapshot.notifications!.map(n =>
        <article className="info-note" key={n.id}>
          <p>{n.text}</p><small>{new Date(n.created_at).toLocaleString()}</small>
          {!n.read_at && <button className="button secondary" disabled={busy} onClick={() => void run(() => api("notifications/read", { id: n.id }))}>Mark as read</button>}
          {n.project_id && <button className="button secondary" onClick={() => {
            const task = snapshot.projects.find(p => p.id === n.project_id);
            if (task) { setInbox(false); setView("studio"); setTimeout(() => window.dispatchEvent(new CustomEvent("crewcanvas:open-work", { detail: { id: task.workerId, projectId: task.id } })), 0); }
          }}>Open task</button>}
        </article>)}
    </Modal>}
    {help && <Modal title="Help" onClose={() => setHelp(false)}><div className="help-content">
      <p>Choose a project, open a role, then choose a member to see their tasks. Use Back to return one level.</p>
      <p>Drag the board to move around. Choose Select to move objects. Notes, drawing, files, and zoom tools are beside the board.</p>
      <p>Both people must accept the terms before work starts. Work approval and payment status are tracked separately.</p>
      <button className="button primary" onClick={() => setHelp(false)}>Done</button>
    </div></Modal>}
    {busy && <div className="busy-indicator" role="status"><LoaderCircle size={15} className="spin" />Saving changes…</div>}
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={16} /></button></div>}
  </div>;
}
function Brand() { return <div className="brand">CrewCanvas</div>; }
function Invitation({
  onClose,
  onNotify,
  initialRole,
}: {
  onClose: () => void;
  onNotify: (s: string) => void;
  initialRole?: string;
}) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(initialRole ?? "");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Invite member"
      description="Invite a teammate by email. They’ll get access after accepting."
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
        {initialRole && (
          <p className="fine-print">
            Once they accept, use “+ Add member” in the {initialRole}{" "}
            roster to place them in this project.
          </p>
        )}
        <button className="button primary" disabled={busy}>
          <UserPlus size={16} />
          Create invitation link
        </button>
        {result && (
          <div className="info-note">
            <p>{result}</p>
            {(
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
