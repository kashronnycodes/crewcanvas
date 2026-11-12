import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../src/App";
import { resetDemo, setDemoActor } from "./fixtures/testRepository";
import { IDS } from "../shared/seed";
vi.mock("../src/services", () => import("./fixtures/testRepository"));
vi.mock("../src/components/AccountGate", () => ({ default: ({ children }: { children: (a: string, w: string, c: () => void) => unknown }) => children("auth", "workspace", () => {}) }));
vi.mock("../src/components/WorkflowCanvas", () => ({ default: () => <div>Map</div> }));
beforeEach(() => resetDemo());
afterEach(cleanup);
function show() { const query = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={query}><App /></QueryClientProvider>); return query; }
it("shows one active page and puts secondary actions in the workspace menu", async () => {
 const query = show();
 const tab = await screen.findByRole("button", { name: "Project Studio" });
 expect(tab.getAttribute("aria-current")).toBe("page");
 expect(screen.queryByText(/simulated|People. Projects. Possibilities/)).toBeNull();
 expect(screen.queryByRole("button", { name: "Invite member" })).toBeNull();
 fireEvent.click(screen.getByRole("button", { name: "Workspace menu" }));
 expect(screen.getByRole("button", { name: "Invite member" })).toBeTruthy();
 expect(screen.getByRole("button", { name: "Workspaces" })).toBeTruthy();
 fireEvent.click(screen.getByRole("button", { name: "Project Whiteboard" }));
 expect(screen.getByRole("button", { name: "Project Whiteboard" }).getAttribute("aria-current")).toBe("page");
 query.clear();
});
it("keeps invitation controls unavailable to freelancers", async () => {
 setDemoActor(IDS.ava); const query=show();
 fireEvent.click(await screen.findByRole("button", { name: "Workspace menu" }));
 expect(screen.queryByRole("button", { name: "Invite member" })).toBeNull();
 expect(screen.getByRole("heading", {name:"My Tasks"})).toBeTruthy();
 expect(screen.queryByRole("button",{name:"Project Studio"})).toBeNull();
 query.clear();
});
