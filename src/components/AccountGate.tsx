import {signInJudge} from "../judgeAccounts";
import JudgeAccounts from "./JudgeAccounts";
import type { User } from "@supabase/supabase-js";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { type ReactNode,useEffect,useState } from "react";
import {
api,
setActiveWorkspace,
signOutSession,
signupAvailable,
supabase,
} from "../services";

interface Membership {
  id: string;
  workspace_id: string;
  access_role: string;
  workspaces: { id: string; name: string; timezone: string };
}
export default function AccountGate(
  { children }: {
    children: (
      authId: string,
      workspaceId: string,
      choose: () => void,
    ) => ReactNode;
  },
) {
  const cache = useQueryClient();
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false);
  const [workspace, setWorkspace] = useState<string | null>(null),
    [choosing, setChoosing] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [signup, setSignup] = useState(false),
    [notice, setNotice] = useState("");
  const [join, setJoin] = useState(() =>
    new URLSearchParams(window.location.search).get("join") ?? ""
  );
  const [name, setName] = useState(""),
    [person, setPerson] = useState(""),
    [timezone, setTimezone] = useState(() =>
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [registration, setRegistration] = useState(false);
  useEffect(() => {
    let alive = true;
    void signupAvailable().then((allowed) => {
      if (alive) setRegistration(allowed);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    let alive = true;
    const deferred = new Set<ReturnType<typeof setTimeout>>();
    let identity: string | null = null;
    function sessionChanged(next: User | null) {
      if (identity !== next?.id) {
        setActiveWorkspace(null);
        setWorkspace(null);
        cache.removeQueries({ queryKey: ["workspace"] });
      }
      identity = next?.id ?? null;
      setUser(next);
      setReady(true);
    }
    void supabase.auth.getSession().then(({ data, error }) => {
      if (alive) {
        sessionChanged(data.session?.user ?? null);
        if (error) setError(error.message);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Queries started by React must run after Supabase releases its Auth
        // event lock; otherwise their getSession() can block sign-out/refresh.
        const timer = setTimeout(() => {
          deferred.delete(timer);
          if (!alive) return;
          sessionChanged(session?.user ?? null);
          if (!session) {
            setActiveWorkspace(null);
            setWorkspace(null);
            cache.removeQueries({ queryKey: ["workspace"] });
            cache.removeQueries({ queryKey: ["memberships"] });
          }
        }, 0);
        deferred.add(timer);
      },
    );
    return () => {
      alive = false;
      for (const timer of deferred) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [cache]);
  const memberships = useQuery<Membership[]>({
    queryKey: ["memberships", user?.id],
    queryFn: () => api("workspaces"),
    enabled: !!user,
    retry: false,
  });
  useEffect(() => {
    if (!memberships.data || !user || join) return;
    const saved = sessionStorage.getItem(`crewcanvas.workspace.${user.id}`);
    const next = memberships.data.find((m) =>
      m.workspace_id === (workspace ?? saved)
    ) ?? memberships.data[0];
    if (next) {
      setActiveWorkspace(next.workspace_id);
      setWorkspace(next.workspace_id);
    }
  }, [memberships.data, user, join, workspace]);
  const select = (id: string) => {
    setActiveWorkspace(id);
    setWorkspace(id);
    sessionStorage.setItem(`crewcanvas.workspace.${user!.id}`, id);
    setChoosing(false);
    cache.removeQueries({ queryKey: ["workspace"] });
  };
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message === "Failed to fetch" ? "Could not connect. Check your connection and try again." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (ready && user && workspace && !choosing && !join) {
    return children(user.id, workspace, () => setChoosing(true));
  }
  return (
    <div className="login-screen">
      <div className="brand">CrewCanvas</div>
      <div className="login-card">
        {!ready ? <p>Restoring your session…</p> : !user
          ? (
            <>
              <h1>
                {signup
                  ? "Create account"
                  : "Sign in to CrewCanvas"}
              </h1>
              <p>Use your account to open your workspaces.</p>
              {!supabase
                ? (
                  <p role="alert">
                    Configure the Supabase URL and publishable key to connect
                    this build.
                  </p>
                )
                : (
                  <form
                    className="stacked-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      void action(async () => {
                        const credentials = {
                          email: String(form.get("email")),
                          password: String(form.get("password")),
                        };
                        const result = signup
                          ? await supabase!.auth.signUp({
                            ...credentials,
                            options: {
                              emailRedirectTo: window.location.origin + (join
                                ? `/?join=${encodeURIComponent(join)}`
                                : "/"),
                            },
                          })
                          : await supabase!.auth.signInWithPassword(
                            credentials,
                          );
                        if (result.error) throw result.error;
                        if (signup && !result.data.session) {
                          setNotice(
                            "Check your email to confirm your account, then sign in here.",
                          );
                        }
                      });
                    }}
                  >
                    <label>
                      Email address<input
                        name="email"
                        type="email"
                        autoComplete="username"
                        required
                      />
                    </label>
                    <label>
                      Password<input
                        name="password"
                        type="password"
                        autoComplete={signup
                          ? "new-password"
                          : "current-password"}
                        minLength={signup ? 12 : 8}
                        required
                      />
                    </label>
                    <button className="button primary" disabled={busy}>
                      {busy ? "Signing in…" : signup ? "Create account" : "Sign in"}
                    </button>
                    {registration && (
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          setSignup(!signup);
                          setNotice("");
                          setError("");
                        }}
                      >
                        {signup
                          ? "I already have an account"
                          : "Create a new account"}
                      </button>
                    )}
                    {!registration && (
                      <p className="fine-print">
                        Access is invite-only. Sign in with your CrewCanvas account or ask a workspace owner for an invitation.
                      </p>
                    )}
                  </form>
                )}
              {supabase && !join && <JudgeAccounts busy={busy} onSignIn={async (role, code) => {
                setSignup(false);
                setNotice("");
                await action(() => signInJudge(role, code));
              }} />}
            </>
          )
          : (
            <>
              <h1>{join ? "Join workspace" : "Workspaces"}</h1>
              <p>Signed in as {user.email}</p>
              {join
                ? (
                  <>
                    <p>
                      Your invitation grants access only to the assigned
                      workspace. Sign in using the invited email address.
                    </p>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          const result = await api("invites/accept", {
                            token: join,
                          });
                          await memberships.refetch();
                          setJoin("");
                          window.history.replaceState({}, "", "/");
                          select(result.workspaceId);
                        })}
                    >
                      Accept invitation
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setJoin("");
                        window.history.replaceState({}, "", "/");
                      }}
                    >
                      Cancel invitation
                    </button>
                  </>
                )
                : (
                  <>
                    {memberships.isPending
                      ? <p>Loading workspaces…</p>
                      : memberships.data?.map((m) => (
                        <button
                          className="button secondary"
                          key={m.id}
                          disabled={busy}
                          onClick={() => select(m.workspace_id)}
                        >
                          {m.workspaces.name} ·{" "}
                          {m.access_role === "worker"
                            ? "Freelancer"
                            : "Employer"}
                        </button>
                      ))}
                    {memberships.error && (
                      <p role="alert">
                        {memberships.error.message}
                        <button onClick={() => void memberships.refetch()}>
                          Try again
                        </button>
                      </p>
                    )}
                    <form
                      className="stacked-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action(async () => {
                          const result = await api("workspaces/create", {
                            name,
                            personName: person,
                            timezone,
                          }, requestId);
                          await memberships.refetch();
                          setRequestId(crypto.randomUUID());
                          select(result.workspaceId);
                        });
                      }}
                    >
                      <h2>Create a workspace</h2>
                      <label>
                        Your name<input
                          value={person}
                          onChange={(e) => setPerson(e.target.value)}
                          minLength={2}
                          maxLength={80}
                          required
                        />
                      </label>
                      <label>
                        Workspace name<input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          minLength={2}
                          maxLength={80}
                          required
                        />
                      </label>
                      <label>
                        Timezone<input
                          value={timezone}
                          onChange={(e) => setTimezone(e.target.value)}
                          maxLength={80}
                          required
                        />
                      </label>
                      <button className="button primary" disabled={busy}>
                        Create workspace
                      </button>
                    </form>
                  </>
                )}
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void action(signOutSession)}
              >
                Sign out
              </button>
            </>
          )}
        {error && <p className="error-message" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </div>

    </div>
  );
}
