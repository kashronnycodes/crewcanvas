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
import { mutateDemo, repository, resetDemo } from "../src/services";
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
  fireEvent.click(await screen.findByRole("button", { name: "Task list" }));
  const snapshot = await repository.load();
  const task = snapshot.projects[0],
    person = snapshot.people.find((p) => p.id === task.workerId)!;
  fireEvent.click(
    await screen.findByRole("button", { name: `Open member ${person.name}` }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Task details →" }),
  );
  fireEvent.click(await screen.findByRole("tab", { name: "Deliverables" }));
  expect(
    (await screen.findByRole("tab", { name: "Deliverables" })).getAttribute(
      "aria-selected",
    ),
  ).toBe("true");
  return query;
}
it("opens submitted work directly and approves work without marking payment paid", async () => {
  const before = (await repository.load()).projects[0];
  const query = await openSubmission();
  fireEvent.click(await screen.findByRole("button", { name: "Approve Work" }));
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
    await screen.findByRole("button", { name: "Request Revision" }),
  );
  expect(
    screen.getByRole("tab", { name: "Revisions" }).getAttribute(
      "aria-selected",
    ),
  ).toBe("true");
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
