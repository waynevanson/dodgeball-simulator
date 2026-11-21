export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const rand = (lo = 0, hi = 1): number => lo + Math.random() * (hi - lo);

export const randInt = (lo: number, hi: number): number => Math.floor(rand(lo, hi + 1));

export const pick = <T>(list: readonly T[]): T => list[(Math.random() * list.length) | 0];

export const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay);

export const angleTo = (ax: number, ay: number, bx: number, by: number): number =>
  Math.atan2(by - ay, bx - ax);

export const wrapAngle = (a: number): number => {
  let angle = (a + Math.PI) % TAU;
  if (angle < 0) angle += TAU;
  return angle - Math.PI;
};

export interface Normalised {
  x: number;
  y: number;
  l: number;
}

export const norm = (x: number, y: number): Normalised => {
  const l = Math.hypot(x, y);
  return l < 1e-6 ? { x: 0, y: 0, l: 0 } : { x: x / l, y: y / l, l };
};

export interface Approach {
  t: number;
  x: number;
  y: number;
  d: number;
}

/**
 * Time of closest approach between a moving object (bx,by,bvx,bvy) and a
 * roughly static point (px,py). Used for dodge and catch decisions.
 */
export const closestApproach = (
  px: number,
  py: number,
  bx: number,
  by: number,
  bvx: number,
  bvy: number,
  maxT = 1,
): Approach => {
  const rx = px - bx;
  const ry = py - by;
  const vv = bvx * bvx + bvy * bvy;
  if (vv < 1e-6) return { t: 0, x: bx, y: by, d: Math.hypot(rx, ry) };
  const t = clamp((rx * bvx + ry * bvy) / vv, 0, maxT);
  const x = bx + bvx * t;
  const y = by + bvy * t;
  return { t, x, y, d: Math.hypot(px - x, py - y) };
};

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/** Build a rounded-rect path. Callers own fill/stroke. */
export const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void => {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};
