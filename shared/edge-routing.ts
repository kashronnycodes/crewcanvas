export type Side = "top" | "bottom" | "left" | "right";
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Route {
  path: string;
  sourceSide: Side;
  targetSide: Side;
  axis: "x" | "y";
  labelX: number;
  labelY: number;
}
const point = (r: Bounds, side: Side) => ({
  x: side === "left"
    ? r.x
    : side === "right"
    ? r.x + r.width
    : r.x + r.width / 2,
  y: side === "top"
    ? r.y
    : side === "bottom"
    ? r.y + r.height
    : r.y + r.height / 2,
});
// Flow-space geometry is independent of pan/zoom and supports nested node positions.
export function routeConnection(a: Bounds, b: Bounds, previous?: Route): Route {
  const dx = b.x + b.width / 2 - a.x - a.width / 2,
    dy = b.y + b.height / 2 - a.y - a.height / 2;
  const gapX = Math.abs(dx) - (a.width + b.width) / 2,
    gapY = Math.abs(dy) - (a.height + b.height) / 2;
  const scoreX = Math.abs(dx) / Math.max(1, (a.width + b.width) / 2),
    scoreY = Math.abs(dy) / Math.max(1, (a.height + b.height) / 2);
  let axis: "x" | "y" = gapX >= 0 && (gapY < 0 || scoreX >= scoreY) ? "x" : "y";
  // Keep a feasible side near a tie, instead of flickering between equal choices.
  if (
    previous &&
    (previous.axis === "x"
      ? gapX >= 0 && scoreX * 1.18 >= scoreY
      : gapY >= 0 && scoreY * 1.18 >= scoreX)
  ) axis = previous.axis;
  let sourceSide: Side = axis === "x"
    ? dx >= 0 ? "right" : "left"
    : dy >= 0
    ? "bottom"
    : "top";
  let targetSide: Side = axis === "x"
    ? dx >= 0 ? "left" : "right"
    : dy >= 0
    ? "top"
    : "bottom";
  if (gapX < 0 && gapY < 0) {
    // Overlapping nodes need an outside rail. Contained nodes necessarily occlude
    // part of a connection until separated; never draw unstable or invalid paths.
    axis = "y";
    sourceSide = "top";
    targetSide = "top";
    const s = point(a, sourceSide),
      t = point(b, targetSide),
      rail = Math.min(a.y, b.y) - 48;
    return {
      axis,
      sourceSide,
      targetSide,
      path: `M ${s.x},${s.y} C ${s.x},${rail} ${s.x},${rail} ${
        (s.x + t.x) / 2
      },${rail} S ${t.x},${rail} ${t.x},${t.y}`,
      labelX: (s.x + t.x) / 2,
      labelY: rail,
    };
  }
  const s = point(a, sourceSide), t = point(b, targetSide);
  const aligned = axis === "x"
    ? Math.abs(s.y - t.y) < .5
    : Math.abs(s.x - t.x) < .5;
  const distance = Math.max(0, (axis === "x" ? gapX : gapY) / 2);
  const sign = axis === "x" ? Math.sign(dx) : Math.sign(dy);
  const c1 = {
    x: s.x + (axis === "x" ? sign * distance : 0),
    y: s.y + (axis === "y" ? sign * distance : 0),
  };
  const c2 = {
    x: t.x - (axis === "x" ? sign * distance : 0),
    y: t.y - (axis === "y" ? sign * distance : 0),
  };
  return {
    axis,
    sourceSide,
    targetSide,
    path: aligned
      ? `M ${s.x},${s.y} L ${t.x},${t.y}`
      : `M ${s.x},${s.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${t.x},${t.y}`,
    labelX: (s.x + t.x) / 2,
    labelY: (s.y + t.y) / 2,
  };
}
