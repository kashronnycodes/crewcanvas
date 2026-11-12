vi.mock("../src/services", () => import("./fixtures/testRepository"));
vi.mock("../src/components/AccountGate", () => ({ default: ({ children }: { children: (a: string, w: string, c: () => void) => unknown }) => children("fixture-auth", "fixture-workspace", () => {}) }));
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../src/App";
import { mutateDemo, repository, resetDemo } from "./fixtures/testRepository";
import { projectFinance } from "../shared/workspace";
import type { WorkspaceSnapshot } from "../shared/types";
vi.mock(
  "../src/components/WorkflowCanvas",
  () => ({ default: () => <div>Reference canvas under test</div> }),
);
beforeEach(() => {
  resetDemo();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  mutateDemo((s) => {
    const p = s.projects[0];
    p.state = "submitted";
    p.revisions = [];
    p.proposals = [];
    p.deliveries = [{
      id: crypto.randomUUID(),
      agreementId: p.activeAgreementId!,
      url: "https://drive.google.com/file/d/synthetic/view",
      label: "Promotional video draft",
      note: "Synthetic review fixture",
      submittedAt: new Date().toISOString(),
      status: "submitted",
    }];
  });
});
afterEach(cleanup);
async function openSubmission() {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={query}>
      <App />
    </QueryClientProvider>,
  );
  await screen.findByRole("button",{name:"Project Studio"});
  const snapshot=await repository.load();const task=snapshot.projects[0];
  fireEvent(window,new CustomEvent("crewcanvas:open-work",{detail:{id:task.workerId,projectId:task.id}}));
  await screen.findByRole("region", {name:"Files and previews"});
  expect(screen.getByRole("region", {name:"Task details"}).querySelectorAll(".deliverable-preview")).toHaveLength(0);
  expect(screen.getByRole("region", {name:"Files and previews"}).querySelectorAll(".deliverable-preview")).toHaveLength(1);
  expect(screen.queryByRole("combobox", {name:"Member panel view"})).toBeNull();
  return query;
}
it("opens submitted work directly and approves work without marking payment paid", async () => {
  const before = (await repository.load()).projects[0];
  const query = await openSubmission();
  fireEvent.click(await screen.findByRole("button", { name: "Approve work" }));
  await screen.findByRole("dialog", {name:"Approve this submission?"});
  expect((await repository.load()).projects[0].state).toBe("submitted");
  fireEvent.click(screen.getByRole("button", {name:"Cancel"}));
  expect((await repository.load()).projects[0].state).toBe("submitted");
  fireEvent.click(screen.getByRole("button", {name:"Approve work"}));
  fireEvent.click(await screen.findByRole("button", {name:"Yes, approve work"}));
  await waitFor(async () =>
    expect((await repository.load()).projects[0].state).toBe("accepted")
  );
  expect((await repository.load()).projects[0].invoices).toEqual(
    before.invoices,
  );
  query.clear();
});
it("opens revision feedback and sends a request without adding a fee or invoice", async () => {
  const before = (await repository.load()).projects[0];
  const query = await openSubmission();
  fireEvent.click(
    await screen.findByRole("button", { name: "Request revision" }),
  );
  expect(screen.getAllByRole("region").filter(e=>e.hasAttribute("data-task-section")).map(e=>e.getAttribute("aria-label"))).toEqual(["Task details","Files and previews","Revisions","Payments","Activity"]);
  fireEvent.change(
    screen.getByLabelText("Your feedback"),
    { target: { value: "Please change the background music." } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Review manually" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /Send revision request/ }),
  );
  await waitFor(async () =>
    expect((await repository.load()).projects[0].state).toBe(
      "changes_requested",
    )
  );
  const after = (await repository.load()).projects[0];
  expect(projectFinance(after).total).toBe(projectFinance(before).total);
  expect(after.proposals).toHaveLength(0);
  expect(after.invoices).toEqual(before.invoices);
  query.clear();
});
