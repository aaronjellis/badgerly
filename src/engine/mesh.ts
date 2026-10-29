/**
 * Triangle-mesh building blocks for prismatic (2.5D) solids: caps, vertical walls, lofts between
 * offset rings, and edge profiles. Pieces that share a ring share its exact points, so merging
 * them yields a watertight mesh without any 3D boolean.
 *
 * Frame: x and y are badge mm (y down, as in the 2D frame), z is up from the bed. The frame is
 * right-handed, so a Clipper outer contour (positive area) runs counter-clockwise seen from +z.
 * Winding is outward: the right-hand normal of each triangle points out of the solid, and a closed
 * solid has positive signed volume.
 */
import earcut from 'earcut';
import type { Poly, Pt } from './geom';

/** x y z triples, 9 numbers per triangle, in mm; outward-facing winding. */
export interface Mesh {
  positions: number[];
}

export class RingMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RingMismatchError';
  }
}

/** Standard signed area: positive for counter-clockwise seen from +z, which is Clipper's outer orientation. */
function signedArea(contour: Pt[]): number {
  let a = 0;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    a += contour[j].x * contour[i].y - contour[i].x * contour[j].y;
  }
  return a / 2;
}

function pointInContour(p: Pt, contour: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const a = contour[i];
    const b = contour[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Splits a poly into earcut groups: each outer contour with the holes it directly contains. */
function capGroups(poly: Poly): Pt[][][] {
  const outers = poly.filter((c) => signedArea(c) > 0);
  const groups = outers.map((outer) => [outer]);
  if (groups.length === 0) return [];
  for (const hole of poly) {
    if (signedArea(hole) >= 0) continue;
    // The smallest outer containing the hole's midpoint of its first edge is its direct parent.
    const probe = { x: (hole[0].x + hole[1].x) / 2, y: (hole[0].y + hole[1].y) / 2 };
    let best = -1;
    for (let k = 0; k < outers.length; k++) {
      if (!pointInContour(probe, outers[k])) continue;
      if (best < 0 || signedArea(outers[k]) < signedArea(outers[best])) best = k;
    }
    groups[best < 0 ? 0 : best].push(hole);
  }
  return groups;
}

function pushTri(out: number[], a: Pt, za: number, b: Pt, zb: number, c: Pt, zc: number): void {
  out.push(a.x, a.y, za, b.x, b.y, zb, c.x, c.y, zc);
}

/**
 * The flat face of `poly` at height `z`, normal +z when `faceUp`, -z otherwise. Triangulated with
 * earcut on the poly's own points, so its boundary edges match `wallMesh` and `loftMesh` exactly.
 * Expects contours without repeated or collinear points (as Clipper returns them). Earcut can
 * still drop a point that its hole bridges leave on a straight run (several holes along one line,
 * such as letters on a baseline); `restoreSkipped` puts such points back.
 */
export function capMesh(poly: Poly, z: number, faceUp: boolean): Mesh {
  const positions: number[] = [];
  for (const group of capGroups(poly)) {
    const pts: Pt[] = [];
    const coords: number[] = [];
    const holes: number[] = [];
    group.forEach((contour, k) => {
      if (k > 0) holes.push(pts.length);
      for (const p of contour) {
        pts.push(p);
        coords.push(p.x, p.y);
      }
    });
    const indices = earcut(coords, holes);
    const tris: Pt[][] = [];
    for (let t = 0; t < indices.length; t += 3) tris.push([pts[indices[t]], pts[indices[t + 1]], pts[indices[t + 2]]]);
    // Earcut winds all triangles alike; read its orientation from the total and flip to suit.
    let total = 0;
    for (const [a, b, c] of tris) total += (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    const flip = total > 0 !== faceUp;
    for (const [a, b, c] of restoreSkipped(group, tris)) {
      if (flip) pushTri(positions, a, z, c, z, b, z);
      else pushTri(positions, a, z, b, z, c, z);
    }
  }
  return { positions };
}

const ptKey = (p: Pt) => `${p.x},${p.y}`;
const edgeKey = (a: Pt, b: Pt) => {
  const ka = ptKey(a);
  const kb = ptKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

/**
 * Splits every triangle whose outer edge skips contour points that lie on it, so the cap's
 * boundary runs through every point of its contours. An outer edge is one no other triangle
 * shares; it is fine when it is a contour edge, and otherwise earcut dropped the points between
 * its ends (they are exactly on it, within 1e-6 mm). Keeps each triangle's winding.
 */
function restoreSkipped(group: Pt[][], tris: Pt[][]): Pt[][] {
  const contourEdges = new Set<string>();
  for (const c of group) for (let i = 0; i < c.length; i++) contourEdges.add(edgeKey(c[i], c[(i + 1) % c.length]));
  const uses = new Map<string, number>();
  for (const t of tris) for (let e = 0; e < 3; e++) {
    const k = edgeKey(t[e], t[(e + 1) % 3]);
    uses.set(k, (uses.get(k) ?? 0) + 1);
  }
  const skipped = new Set<string>();
  for (const [k, n] of uses) if (n === 1 && !contourEdges.has(k)) skipped.add(k);
  if (skipped.size === 0) return tris;
  const points = group.flat();
  /** The contour points strictly inside a–b, ordered from a. */
  const onEdge = (a: Pt, b: Pt): Pt[] => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const found: { p: Pt; t: number }[] = [];
    for (const p of points) {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      if (t <= 0 || t >= 1) continue;
      const cross = (p.x - a.x) * dy - (p.y - a.y) * dx;
      if (cross * cross <= 1e-12 * len2) found.push({ p, t });
    }
    return found.sort((u, v) => u.t - v.t).map((f) => f.p);
  };
  const out: Pt[][] = [];
  const queue = [...tris];
  while (queue.length > 0) {
    const tri = queue.pop()!;
    let split = false;
    for (let e = 0; e < 3 && !split; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const c = tri[(e + 2) % 3];
      if (!skipped.has(edgeKey(a, b))) continue;
      const mids = onEdge(a, b).filter((p) => p !== c);
      if (mids.length === 0) continue;
      const run = [a, ...mids, b];
      for (let i = 0; i + 1 < run.length; i++) queue.push([run[i], run[i + 1], c]);
      split = true;
    }
    if (!split) out.push(tri);
  }
  return out;
}

/**
 * Vertical quads from `z0` up to `z1` (z1 > z0) along every contour. Each edge a→b gives the
 * triangles (a0, b0, b1) and (a0, b1, a1), which face away from an outer contour and into a hole.
 */
export function wallMesh(poly: Poly, z0: number, z1: number): Mesh {
  const positions: number[] = [];
  for (const contour of poly) {
    for (let i = 0; i < contour.length; i++) {
      const a = contour[i];
      const b = contour[(i + 1) % contour.length];
      pushTri(positions, a, z0, b, z0, b, z1);
      pushTri(positions, a, z0, b, z1, a, z1);
    }
  }
  return { positions };
}

function centroid(contour: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
    const cross = contour[j].x * contour[i].y - contour[i].x * contour[j].y;
    a += cross;
    cx += (contour[j].x + contour[i].x) * cross;
    cy += (contour[j].y + contour[i].y) * cross;
  }
  if (Math.abs(a) < 1e-12) {
    const n = contour.length;
    return { x: contour.reduce((s, p) => s + p.x, 0) / n, y: contour.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/**
 * Zips one lower ring to one upper ring of the same orientation. The upper walk starts at the
 * vertex nearest the lower's first vertex; then, until both rings have wrapped around, it advances
 * whichever ring makes the shorter new diagonal, emitting one triangle per advance:
 * - lower advance: (L[i], L[i+1], U[j])
 * - upper advance: (L[i], U[j+1], U[j])
 * Both match `wallMesh`'s winding, so lower-ring edges run in contour order and upper-ring edges
 * against it, and the zipper closes on the diagonal it started from.
 */
function zipRings(out: number[], lower: Pt[], zLower: number, upper: Pt[], zUpper: number): void {
  const n = lower.length;
  const m = upper.length;
  let j0 = 0;
  for (let k = 1; k < m; k++) if (dist2(upper[k], lower[0]) < dist2(upper[j0], lower[0])) j0 = k;
  const L = (i: number) => lower[i % n];
  const U = (j: number) => upper[(j0 + j) % m];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const advanceLower = j >= m || (i < n && dist2(L(i + 1), U(j)) <= dist2(L(i), U(j + 1)));
    if (advanceLower) {
      pushTri(out, L(i), zLower, L(i + 1), zLower, U(j), zUpper);
      i++;
    } else {
      pushTri(out, L(i), zLower, U(j + 1), zUpper, U(j), zUpper);
      j++;
    }
  }
}

/**
 * A sloped band from `lower` at `zLower` up to `upper` at `zUpper`, typically an offset of `lower`.
 * Each lower contour pairs with the unpaired upper contour of the same orientation whose centroid
 * is nearest. Throws RingMismatchError when the outer or hole counts differ.
 */
export function loftMesh(lower: Poly, zLower: number, upper: Poly, zUpper: number): Mesh {
  if (lower.length !== upper.length) {
    throw new RingMismatchError(`Cannot loft ${lower.length} contours onto ${upper.length}`);
  }
  const info = (poly: Poly) => poly.map((c) => ({ contour: c, outer: signedArea(c) > 0, c: centroid(c) }));
  const lo = info(lower);
  const up = info(upper);
  const loOuters = lo.filter((r) => r.outer).length;
  const upOuters = up.filter((r) => r.outer).length;
  if (loOuters !== upOuters) {
    throw new RingMismatchError(`Cannot loft ${loOuters} outer contours onto ${upOuters}`);
  }
  // Pair globally nearest first, so two lower contours never claim the same upper one.
  const candidates: { a: number; b: number; d: number }[] = [];
  lo.forEach((l, a) => up.forEach((u, b) => {
    if (l.outer === u.outer) candidates.push({ a, b, d: dist2(l.c, u.c) });
  }));
  candidates.sort((p, q) => p.d - q.d);
  const loUsed = new Set<number>();
  const upUsed = new Set<number>();
  const positions: number[] = [];
  for (const { a, b } of candidates) {
    if (loUsed.has(a) || upUsed.has(b)) continue;
    loUsed.add(a);
    upUsed.add(b);
    zipRings(positions, lo[a].contour, zLower, up[b].contour, zUpper);
  }
  return { positions };
}

/**
 * Rings for an edge treatment, from the wall top up: `insetMm` shrinks the outline and `riseMm`
 * is the height above the wall top. The first entry is the outline at the wall top, the last
 * the flat top ring. Fillet steps keep each chord within `maxStepMm` of the arc.
 */
export function edgeProfile(
  edge: 'none' | 'chamfer' | 'fillet',
  sizeMm: number,
  maxStepMm = 0.02
): { insetMm: number; riseMm: number }[] {
  const base = { insetMm: 0, riseMm: 0 };
  if (edge === 'none' || !(sizeMm > 0)) return [base];
  if (edge === 'chamfer') return [base, { insetMm: sizeMm, riseMm: sizeMm }];
  const half = Math.acos(Math.max(-1, 1 - maxStepMm / sizeMm));
  const n = Math.max(1, Math.ceil(Math.PI / 2 / (2 * half)));
  const out = [base];
  for (let k = 1; k < n; k++) {
    const theta = (k / n) * (Math.PI / 2);
    out.push({ insetMm: sizeMm - sizeMm * Math.cos(theta), riseMm: sizeMm * Math.sin(theta) });
  }
  out.push({ insetMm: sizeMm, riseMm: sizeMm });
  return out;
}

export function mergeMeshes(meshes: Mesh[]): Mesh {
  const positions: number[] = [];
  for (const mesh of meshes) for (let k = 0; k < mesh.positions.length; k++) positions.push(mesh.positions[k]);
  return { positions };
}

/**
 * Whether the mesh is a closed, consistently wound surface: every directed edge a→b appears once
 * and its reverse b→a appears once. Vertices are keyed by coordinates rounded to 1e-4 mm; a
 * triangle with two coincident vertices fails the check.
 */
export function isClosed(mesh: Mesh): boolean {
  const p = mesh.positions;
  if (p.length === 0 || p.length % 9 !== 0) return false;
  const key = (k: number) =>
    `${Math.round(p[k] * 1e4)},${Math.round(p[k + 1] * 1e4)},${Math.round(p[k + 2] * 1e4)}`;
  const edges = new Map<string, number>();
  for (let t = 0; t < p.length; t += 9) {
    const v = [key(t), key(t + 3), key(t + 6)];
    if (v[0] === v[1] || v[1] === v[2] || v[2] === v[0]) return false;
    for (let e = 0; e < 3; e++) {
      const id = `${v[e]}>${v[(e + 1) % 3]}`;
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
  for (const [id, count] of edges) {
    if (count !== 1) return false;
    const [a, b] = id.split('>');
    if (edges.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

/** The enclosed volume in mm³: positive for a closed mesh wound outward. */
export function signedVolume(mesh: Mesh): number {
  const p = mesh.positions;
  let v = 0;
  for (let t = 0; t < p.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = p.slice(t, t + 9);
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}
