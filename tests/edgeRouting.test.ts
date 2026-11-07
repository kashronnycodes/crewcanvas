import { describe, expect, it } from "vitest";
import {
  type Bounds,
  type Route,
  routeConnection,
} from "../shared/edge-routing";
const a = { x: 0, y: 0, width: 200, height: 100 };
describe("four-sided flow-space connections", () => {
  it("uses straight outward horizontal and vertical anchors in both directions", () => {
    for (
      const [b, s, t] of [
        [{ ...a, x: 400 }, "right", "left"],
        [{ ...a, x: -400 }, "left", "right"],
        [{ ...a, y: 300 }, "bottom", "top"],
        [{ ...a, y: -300 }, "top", "bottom"],
      ] as const
    ) {
      expect(routeConnection(a, b)).toMatchObject({
        sourceSide: s,
        targetSide: t,
      });
      expect(routeConnection(a, b).path).toContain(" L ");
    }
  });
  it("uses measured dimensions and clean cubic curves for diagonals", () => {
    const r = routeConnection(a, { x: 600, y: 170, width: 400, height: 180 });
    expect(r.sourceSide).toBe("right");
    expect(r.path).toContain("C");
    expect(r.path).toMatch(/^M 200,50/);
    expect(r.path).toMatch(/600,260$/);
  });
  it("keeps the current feasible side near a tie and switches after a clear move", () => {
    const square = { x: 0, y: 0, width: 100, height: 100 };
    const first = routeConnection(square, { ...square, x: 300, y: 290 });
    expect(first.axis).toBe("x");
    const nearby = routeConnection(
      square,
      { ...square, x: 300, y: 310 },
      first,
    );
    expect(nearby.axis).toBe("x");
    expect(routeConnection(square, { ...square, x: 300, y: 430 }, nearby).axis)
      .toBe("y");
  });
  it("routes overlaps and contained objects with finite outside rails", () => {
    for (
      const b of [{ ...a, x: 60, y: 20 }, {
        x: 20,
        y: 20,
        width: 40,
        height: 40,
      }, a]
    ) {
      const r = routeConnection(a, b);
      expect(r.labelY).toBeLessThan(Math.min(a.y, b.y));
      expect(r.path).not.toMatch(/NaN|Infinity/);
    }
  });
  it("remains stable through rapid drags, resizing and hundreds of objects", () => {
    let previous: Route | undefined;
    const nodes: Bounds[] = Array.from(
      { length: 500 },
      (_, i) => ({
        x: (i % 25) * 340,
        y: Math.floor(i / 25) * 230,
        width: 200 + i % 50,
        height: 100 + i % 30,
      }),
    );
    for (let frame = 0; frame < 30; frame++) {
      for (let i = 1; i < nodes.length; i++) {
        const r = routeConnection(nodes[i - 1], {
          ...nodes[i],
          x: nodes[i].x + frame * 3,
          width: nodes[i].width + frame,
        }, previous);
        expect(r.path).not.toMatch(/NaN|Infinity/);
        previous = r;
      }
    }
  });
});
