/**
 * Polygon sets in millimeters on Clipper2. A Poly is a list of closed contours in Clipper's
 * orientation: outer contours have positive area, holes negative. Badge coordinates have y down.
 */
import { Clipper, ClipperOffset, EndType, FillRule, JoinType, Path64, Paths64 } from 'clipper2-js';

export type Pt = { x: number; y: number };
export type Poly = Pt[][];
export type Rect = { x: number; y: number; w: number; h: number };

/** Clipper works on integers: 1000 units per millimeter. */
export const UNITS_PER_MM = 1000;
/** Chord tolerance for on-screen geometry. */
export const PREVIEW_TOL_MM = 0.05;
/** Chord tolerance for exported geometry. */
export const EXPORT_TOL_MM = 0.01;

const MITER_LIMIT = 2;

export function toPaths64(poly: Poly): Paths64 {
  const paths = new Paths64();
  for (const contour of poly) {
    const path = new Path64();
    for (const p of contour) path.push({ x: Math.round(p.x * UNITS_PER_MM), y: Math.round(p.y * UNITS_PER_MM) });
    paths.push(path);
  }
  return paths;
}

/** Converts back to mm, dropping points on a straight run and contours with fewer than three points. */
export function fromPaths64(paths: Paths64): Poly {
  return paths
    .map((path) => Clipper.trimCollinear(path))
    .filter((path) => path.length >= 3)
    .map((path) => path.map((p) => ({ x: p.x / UNITS_PER_MM, y: p.y / UNITS_PER_MM })));
}

export function union(polys: Poly[]): Poly {
  const subject = new Paths64();
  for (const poly of polys) subject.push(...toPaths64(poly));
  return fromPaths64(Clipper.Union(subject, undefined, FillRule.NonZero));
}

export function difference(a: Poly, b: Poly): Poly {
  return fromPaths64(Clipper.Difference(toPaths64(a), toPaths64(b), FillRule.NonZero));
}

export function intersect(a: Poly, b: Poly): Poly {
  return fromPaths64(Clipper.Intersect(toPaths64(a), toPaths64(b), FillRule.NonZero));
}

/**
 * A ClipperOffset whose polygon walk tracks the previous vertex. clipper2-js 1.2.4 passes
 * `offsetPoint` the last vertex's index for every vertex, which breaks every corner after the
 * first two. Open paths take another route (see `offsetOpen`), so only polygons need this.
 */
function polygonOffsetter(tolMm: number): ClipperOffset {
  const co = new ClipperOffset(MITER_LIMIT, tolMm * UNITS_PER_MM);
  const walker = co as unknown as { offsetPoint(group: unknown, path: Path64, j: number, k: number): void };
  const offsetPoint = walker.offsetPoint;
  walker.offsetPoint = function (this: unknown, group, path, j) {
    offsetPoint.call(this, group, path, j, (j + path.length - 1) % path.length);
  };
  return co;
}

/** Grows (positive) or shrinks (negative) a polygon with round joins, no chord further than `tolMm` from its arc. */
export function offset(poly: Poly, deltaMm: number, tolMm: number): Poly {
  const co = polygonOffsetter(tolMm);
  co.addPaths(toPaths64(poly), JoinType.Round, EndType.Polygon);
  const solution = new Paths64();
  co.execute(deltaMm * UNITS_PER_MM, solution);
  return fromPaths64(solution);
}

/** A closed integer path with positive area, so a non-zero union never cancels pieces against each other. */
function positive(points: Pt[]): Path64 {
  const path = new Path64();
  for (const p of points) path.push({ x: Math.round(p.x * UNITS_PER_MM), y: Math.round(p.y * UNITS_PER_MM) });
  return Clipper.area(path) < 0 ? (path.reverse() as Path64) : path;
}

/**
 * The outline of an open path as a stroke `2 · halfWidthMm` wide: butt ends, round joins. Built
 * from one rectangle per segment and a disc at every inner vertex, because clipper2-js 1.2.4
 * mis-walks open paths.
 */
export function offsetOpen(path: Pt[], halfWidthMm: number, tolMm: number): Poly {
  const steps = Math.max(8, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - tolMm / halfWidthMm))));
  const pieces = new Paths64();
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const nx = (-(b.y - a.y) / len) * halfWidthMm;
    const ny = ((b.x - a.x) / len) * halfWidthMm;
    pieces.push(positive([
      { x: a.x + nx, y: a.y + ny },
      { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny },
      { x: a.x - nx, y: a.y - ny },
    ]));
  }
  for (const v of path.slice(1, -1)) {
    pieces.push(positive(Array.from({ length: steps }, (_, k) => ({
      x: v.x + halfWidthMm * Math.cos((2 * Math.PI * k) / steps),
      y: v.y + halfWidthMm * Math.sin((2 * Math.PI * k) / steps),
    }))));
  }
  return fromPaths64(Clipper.Union(pieces, undefined, FillRule.NonZero));
}

/** The signed area of one contour in mm²: positive for an outer contour, negative for a hole. */
function contourArea(contour: Pt[]): number {
  let a = 0;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    a += (contour[j].x + contour[i].x) * (contour[i].y - contour[j].y);
  }
  return a / 2;
}

/** The filled area in mm²: holes subtract. */
export function area(poly: Poly): number {
  return poly.reduce((sum, contour) => sum + contourArea(contour), 0);
}

export function bounds(poly: Poly): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const contour of poly) {
    for (const p of contour) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** The number of outer contours: those with positive area. */
export function outerCount(poly: Poly): number {
  return poly.filter((contour) => contourArea(contour) > 0).length;
}

/** The polygon with every hole removed. */
export function dropHoles(poly: Poly): Poly {
  return poly.filter((contour) => contourArea(contour) > 0);
}

/**
 * Bridges gaps between islands by closing: grow by `d`, then shrink by `d`. Starts at `startMm`
 * and doubles `d` until one outer contour remains or the next `d` would pass `capMm`. When
 * nothing joins, returns the original polygon and the last `d` tried.
 */
export function closeIslands(
  poly: Poly,
  startMm: number,
  capMm: number,
  tolMm: number
): { poly: Poly; bridgedMm: number; joined: boolean } {
  if (outerCount(poly) <= 1) return { poly, bridgedMm: 0, joined: true };
  let d = startMm;
  for (;;) {
    const closed = offset(offset(poly, d, tolMm), -d, tolMm);
    if (outerCount(closed) <= 1) return { poly: closed, bridgedMm: d, joined: true };
    if (d * 2 > capMm) return { poly, bridgedMm: d, joined: false };
    d *= 2;
  }
}

function mapPoints(poly: Poly, f: (p: Pt) => Pt): Poly {
  return poly.map((contour) => contour.map(f));
}

export function translate(poly: Poly, dx: number, dy: number): Poly {
  return mapPoints(poly, (p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Rotates by `deg` degrees about (`cx`, `cy`), the origin by default. */
export function rotate(poly: Poly, deg: number, cx = 0, cy = 0): Poly {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return mapPoints(poly, (p) => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  }));
}

/** Scales by `s` about (`cx`, `cy`), the origin by default. */
export function scale(poly: Poly, s: number, cx = 0, cy = 0): Poly {
  return mapPoints(poly, (p) => ({ x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s }));
}

/** Whether `outer` covers `inner`: the overlap has at least 99.9% of `inner`'s area. */
export function contains(outer: Poly, inner: Poly): boolean {
  return area(intersect(outer, inner)) >= 0.999 * area(inner);
}

/** One `M…Z` subpath per contour. */
export function polyToSvgPath(poly: Poly, decimals = 3): string {
  const num = (v: number) => String(Number(v.toFixed(decimals)));
  return poly
    .map((contour) => `M${contour.map((p) => `${num(p.x)} ${num(p.y)}`).join('L')}Z`)
    .join('');
}

/** The length of a polyline in mm; a closed path includes its closing segment. */
export function pathLength(path: Pt[], closed: boolean): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  if (closed && path.length > 1) {
    length += Math.hypot(path[0].x - path[path.length - 1].x, path[0].y - path[path.length - 1].y);
  }
  return length;
}
