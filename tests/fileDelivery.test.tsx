import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../src/App";
import {
  mutateDemo,
  repository,
  resetDemo,
  setDemoActor,
} from "../src/services";
import { IDS } from "../shared/seed";
vi.mock(
  "../src/components/Canvas",
  () => ({ default: () => <div>Canvas</div>, StatusBadges: () => null }),
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
});
afterEach(cleanup);
it("submits an uploaded file without requiring a Google Drive URL", async () => {
  const fileId = crypto.randomUUID();
  mutateDemo((s) => {
    s.files = [{
      id: fileId,
      workspaceId: s.id,
      projectId: s.projects[0].id,
      uploadedBy: IDS.ava,
      name: "work.pdf",
      mime: "application/pdf",
      size: 100,
      x: 10,
      y: 10,
      version: 1,
      versions: [{
        path: "test.pdf",
        name: "work.pdf",
        mime: "application/pdf",
        size: 100,
        createdAt: new Date().toISOString(),
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
  const role = await screen.findByRole("combobox", {
    name: "Demo viewing role",
  });
  fireEvent.change(role, { target: { value: IDS.ava } });
  fireEvent.click(
    await screen.findByRole("button", { name: "Recruitment cut" }),
  );
  fireEvent.click(await screen.findByRole("tab", { name: "Deliverables" }));
  fireEvent.change(
    screen.getByRole("combobox", { name: "Project file" }),
    { target: { value: fileId } },
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Version label" }), {
    target: { value: "canvas-v1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
  await screen.findByRole("button", { name: "Open submitted file · v1" });
  const project = (await repository.load()).projects[0];
  expect(project.state).toBe("submitted");
  expect(project.deliveries.at(-1)).toMatchObject({
    fileId,
    fileVersion: 0,
    label: "canvas-v1",
  });
  expect(project.invoices).toHaveLength(0);
  client.clear();
  setDemoActor(IDS.myron);
});
