import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../src/App";
import {
  inviteMember,
  repository,
  resetDemo,
  setDemoActor,
} from "../src/services";
import { IDS } from "../shared/seed";
vi.mock("../src/components/Canvas", () => ({
  default: () => <div>Canvas under test</div>,
  StatusBadges: () => null,
}));
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
describe("application interactions", () => {
  it("uses an in-app reset dialog and restores the workspace fixtures", async () => {
    await inviteMember("sam@northstar.example", "Sam Demo", "Illustrator");
    expect((await repository.load()).people).toHaveLength(8);
    const query = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={query}>
        <App />
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: /7\s*creative people/ });
    fireEvent.click(screen.getByRole("button", { name: "Reset local demo" }));
    const restore = await screen.findByRole("button", { name: "Restore demo" });
    fireEvent.click(restore);
    await screen.findByRole("button", { name: /6\s*creative people/ });
    expect((await repository.load()).people).toHaveLength(7);
    query.clear();
  });
  it("does not let a worker invite new members in the demo repository", async () => {
    setDemoActor(IDS.ava);
    await expect(
      inviteMember("sam@northstar.example", "Sam Demo", "Illustrator"),
    ).rejects.toThrow("employer");
  });
});
