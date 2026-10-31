import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  api: vi.fn(),
  setActive: vi.fn(),
  changed: undefined as undefined | ((event: string, session: unknown) => void),
}));
vi.mock("../src/services", () => ({
  api: mocks.api,
  setActiveWorkspace: mocks.setActive,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      signInWithPassword: mocks.signIn,
      signUp: mocks.signUp,
      signOut: mocks.signOut,
      onAuthStateChange: (changed: typeof mocks.changed) => {
        mocks.changed = changed;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
import AccountGate from "../src/components/AccountGate";
let query: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.api.mockResolvedValue([]);
  query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  query.clear();
});
function show() {
  render(
    <QueryClientProvider client={query}>
      <AccountGate>
        {(id, workspace) => <p>Canvas {id} {workspace}</p>}
      </AccountGate>
    </QueryClientProvider>,
  );
}
describe("integrated account onboarding", () => {
  it("shows sign-in and surfaces real authentication errors", async () => {
    mocks.signIn.mockResolvedValue({ error: new Error("Invalid credentials") });
    show();
    await screen.findByRole("button", { name: "Sign in" });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-long-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Invalid credentials",
    );
  });
  it("uses signup with the current origin and preserves an email-bound invitation", async () => {
    window.history.replaceState({}, "", "/?join=" + "a".repeat(64));
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Create a new account" }),
    );
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-long-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("status");
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo: window.location.origin + "/?join=" + "a".repeat(64),
        },
      }),
    );
  });
  it("restores only an accessible workspace after refreshing", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "auth-one", email: "one@example.com" } } },
    });
    sessionStorage.setItem(
      "crewcanvas.workspace.auth-one",
      "foreign-workspace",
    );
    mocks.api.mockResolvedValue([{
      id: "member-one",
      workspace_id: "workspace-one",
      access_role: "employer",
      workspaces: { id: "workspace-one", name: "Studio", timezone: "UTC" },
    }]);
    show();
    await screen.findByText("Canvas auth-one workspace-one");
    expect(mocks.setActive).toHaveBeenCalledWith("workspace-one");
  });
});
