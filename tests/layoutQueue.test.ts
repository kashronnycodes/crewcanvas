import { expect, it } from "vitest";
import { LayoutSaveQueue } from "../src/layoutQueue";
import { seedWorkspace } from "../shared/seed";
it("serializes this tab's rapid saves without overwriting another tab's changes", async () => {
  const queue = new LayoutSaveQueue(), base = seedWorkspace().layout;
  let version = 0;
  const write = async (layout: typeof base) => {
    if (layout.version !== version) throw new Error("CONFLICT");
    version++;
    return { ...layout, version };
  };
  const first = queue.save(
      { ...base, viewport: { x: 1, y: 0, zoom: 1 } },
      write,
    ),
    second = queue.save({ ...base, viewport: { x: 2, y: 0, zoom: 1 } }, write);
  expect((await first).version).toBe(1);
  expect((await second).version).toBe(2);
  version = 3; // A separate tab committed after this tab's second save.
  await expect(
    queue.save({ ...base, viewport: { x: 3, y: 0, zoom: 1 } }, write),
  ).rejects.toThrow("CONFLICT");
  expect(version).toBe(3);
  expect((await queue.save({ ...base, version: 3 }, write)).version).toBe(4);
});
