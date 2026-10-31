import type { CanvasLayout } from "../shared/types";

/** Rebase queued edits only onto this tab's acknowledged saves. A remote write
 * must still cause an optimistic-version conflict instead of being overwritten. */
export class LayoutSaveQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private versions = new Map<number, number>();
  save(
    layout: CanvasLayout,
    write: (layout: CanvasLayout) => Promise<CanvasLayout>,
  ) {
    const task = this.tail.catch(() => {}).then(async () => {
      const expected = this.versions.get(layout.version) ?? layout.version;
      const saved = await write({ ...layout, version: expected });
      for (const [base, version] of this.versions) {
        if (version === expected) this.versions.set(base, saved.version);
      }
      this.versions.set(layout.version, saved.version);
      return saved;
    });
    this.tail = task;
    return task;
  }
  reset() {
    this.versions.clear();
  }
}
